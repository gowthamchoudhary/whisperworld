from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import websockets
from fastapi import WebSocket

from app.core.config import ELEVENLABS_API_KEY
from app.db.supabase_client import supabase_client
from app.services.character_engine import CreatureProfile
from app.services.conversation_agent import (
    ELEVENLABS_CONVAI_URL,
    build_system_prompt,
    _load_history_summary,
    _save_transcript_summary,
)

logger = logging.getLogger(__name__)


class GroupSession:
    """Manages a group conversation session with up to 5 creatures."""

    def __init__(self, profiles: list[CreatureProfile]):
        """
        Initialize a group session with creature profiles.

        Args:
            profiles: List of CreatureProfile objects (max 5)

        Raises:
            ValueError: If more than 5 profiles are provided
        """
        if len(profiles) > 5:
            raise ValueError("Group sessions support a maximum of 5 creatures")

        self.profiles = profiles
        self.response_queue: asyncio.Queue[tuple[str, bytes | str]] = asyncio.Queue()
        self.el_websockets: dict[str, websockets.WebSocketClientProtocol] = {}
        self.transcripts: dict[str, list[str]] = {p.id: [] for p in profiles}
        self.active = True

    async def _open_elevenlabs_ws(
        self,
        profile: CreatureProfile,
        system_prompt: str,
    ) -> websockets.WebSocketClientProtocol | None:
        """
        Open an ElevenLabs ConvAI WebSocket for a single profile with retry logic.

        Returns None if all attempts fail (allows session to continue with other profiles).
        """
        url = f"{ELEVENLABS_CONVAI_URL}?agent_id={profile.voice_id}"
        headers = {"xi-api-key": ELEVENLABS_API_KEY}
        backoff_seconds = [1, 2, 4]

        last_exc: Exception | None = None
        for attempt in range(1, 4):
            try:
                el_ws = await websockets.connect(url, additional_headers=headers)
                # Send initial config message
                init_msg = {
                    "type": "conversation_initiation_client_data",
                    "conversation_config_override": {
                        "agent": {
                            "prompt": {"prompt": system_prompt},
                        },
                        "tts": {"voice_id": profile.voice_id},
                    },
                }
                await el_ws.send(json.dumps(init_msg))
                return el_ws
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "ElevenLabs ConvAI WebSocket for profile %s attempt %d failed: %s",
                    profile.id,
                    attempt,
                    exc,
                )
                if attempt < 3:
                    await asyncio.sleep(backoff_seconds[attempt - 1])

        logger.error(
            "ElevenLabs ConvAI WebSocket for profile %s failed after 3 attempts: %s",
            profile.id,
            last_exc,
        )
        return None

    async def _agent_listener(
        self,
        profile_id: str,
        el_ws: websockets.WebSocketClientProtocol,
    ) -> None:
        """
        Listen to responses from a single ElevenLabs agent and enqueue them.
        """
        try:
            async for raw in el_ws:
                if not self.active:
                    break

                # Enqueue the response with profile ID
                await self.response_queue.put((profile_id, raw))

                # Extract transcript text if available
                if isinstance(raw, str):
                    try:
                        msg = json.loads(raw)
                        if msg.get("type") == "agent_response":
                            text: str = msg.get("agent_response_event", {}).get(
                                "agent_response", ""
                            )
                            if text:
                                self.transcripts[profile_id].append(text)
                    except (json.JSONDecodeError, AttributeError):
                        pass
        except Exception as exc:
            logger.error("Agent listener for profile %s failed: %s", profile_id, exc)

    async def _response_sender(self, websocket: WebSocket) -> None:
        """
        Dequeue responses from the FIFO queue and send them to the client sequentially.
        """
        try:
            while self.active:
                try:
                    profile_id, data = await asyncio.wait_for(
                        self.response_queue.get(), timeout=0.5
                    )
                except asyncio.TimeoutError:
                    continue

                # Send speaking event before audio
                await websocket.send_text(
                    json.dumps({"type": "speaking", "profileId": profile_id})
                )

                # Send the actual response
                if isinstance(data, bytes):
                    await websocket.send_bytes(data)
                else:
                    await websocket.send_text(data)
        except Exception as exc:
            logger.error("Response sender failed: %s", exc)

    async def _user_audio_fanout(
        self,
        websocket: WebSocket,
    ) -> None:
        """
        Receive user audio from client and fan out to all active ElevenLabs connections.
        """
        try:
            while self.active:
                data = await websocket.receive_bytes()

                # Fan out to all active agent connections concurrently
                tasks = [
                    el_ws.send(data)
                    for el_ws in self.el_websockets.values()
                ]
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as exc:
            logger.debug("User audio fanout ended: %s", exc)

    async def run(self, websocket: WebSocket) -> None:
        """
        Run the group session: initialize agents, pipe audio, manage responses.
        """
        await websocket.accept()

        # Initialize ElevenLabs connections for all profiles
        for profile in self.profiles:
            history_summary = await _load_history_summary(profile.id)
            system_prompt = build_system_prompt(profile, history_summary)

            el_ws = await self._open_elevenlabs_ws(profile, system_prompt)
            if el_ws is None:
                # Send error event to client but continue with other profiles
                await websocket.send_text(
                    json.dumps({
                        "type": "error",
                        "profileId": profile.id,
                        "detail": f"Failed to initialize {profile.name}",
                    })
                )
            else:
                self.el_websockets[profile.id] = el_ws

        # If no profiles initialized successfully, close session
        if not self.el_websockets:
            await websocket.send_text(
                json.dumps({
                    "type": "error",
                    "detail": "Failed to initialize any creatures",
                })
            )
            await websocket.close()
            return

        # Start all concurrent tasks
        tasks = []

        # Agent listeners (one per ElevenLabs connection)
        for profile_id, el_ws in self.el_websockets.items():
            tasks.append(asyncio.create_task(self._agent_listener(profile_id, el_ws)))

        # Response sender (dequeues and sends to client)
        tasks.append(asyncio.create_task(self._response_sender(websocket)))

        # User audio fanout (receives from client, fans out to agents)
        tasks.append(asyncio.create_task(self._user_audio_fanout(websocket)))

        # Wait for any task to complete (usually means disconnect)
        try:
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )
        finally:
            # Signal shutdown
            self.active = False

            # Cancel remaining tasks
            for task in tasks:
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

            # Close all ElevenLabs connections
            for el_ws in self.el_websockets.values():
                try:
                    await el_ws.close()
                except Exception:
                    pass

            # Save transcript summaries for all profiles
            for profile in self.profiles:
                if self.transcripts[profile.id]:
                    full_transcript = " ".join(self.transcripts[profile.id])
                    try:
                        await _save_transcript_summary(profile, full_transcript)
                    except Exception as exc:
                        logger.error(
                            "Failed to save transcript for profile %s: %s",
                            profile.id,
                            exc,
                        )

            # Close client WebSocket
            try:
                await websocket.close()
            except Exception:
                pass


async def run_group_session(
    websocket: WebSocket,
    profile_ids: list[str],
) -> None:
    """
    Run a group conversation session with multiple creatures.

    Args:
        websocket: Client WebSocket connection
        profile_ids: List of creature profile IDs (max 5)
    """
    # Enforce max 5 creatures
    if len(profile_ids) > 5:
        await websocket.accept()
        await websocket.send_text(
            json.dumps({
                "type": "error",
                "detail": "Group sessions support a maximum of 5 creatures",
            })
        )
        await websocket.close()
        return

    # Load all profiles from Supabase
    profiles: list[CreatureProfile] = []
    failed_ids: list[str] = []

    for profile_id in profile_ids:
        try:
            response = (
                supabase_client.table("creature_profiles")
                .select("*")
                .eq("id", profile_id)
                .limit(1)
                .execute()
            )
            rows: list[dict] = response.data or []
            if not rows:
                failed_ids.append(profile_id)
                continue

            from app.services.character_engine import _row_to_profile
            profile = _row_to_profile(rows[0])
            profiles.append(profile)
        except Exception as exc:
            logger.error("Failed to load profile %s: %s", profile_id, exc)
            failed_ids.append(profile_id)

    # If no profiles loaded successfully, return error
    if not profiles:
        await websocket.accept()
        await websocket.send_text(
            json.dumps({
                "type": "error",
                "detail": "Failed to load any creature profiles",
            })
        )
        await websocket.close()
        return

    # Create and run group session
    session = GroupSession(profiles)

    # Send error events for failed profiles (but continue with others)
    if failed_ids:
        await websocket.accept()
        for failed_id in failed_ids:
            await websocket.send_text(
                json.dumps({
                    "type": "error",
                    "profileId": failed_id,
                    "detail": f"Failed to load profile {failed_id}",
                })
            )

    await session.run(websocket)
