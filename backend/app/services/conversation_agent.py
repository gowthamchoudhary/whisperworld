from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets
from fastapi import WebSocket

from app.core.config import ELEVENLABS_API_KEY
from app.db.supabase_client import supabase_client
from app.services.character_engine import CreatureProfile

logger = logging.getLogger(__name__)

ELEVENLABS_CONVAI_URL = "wss://api.elevenlabs.io/v1/convai/conversation"


def build_system_prompt(
    profile: CreatureProfile,
    history_summary: str | None = None,
) -> str:
    """Build the system prompt for the ElevenLabs ConvAI agent."""
    traits_str = ", ".join(profile.traits)
    lines = [
        f"You are {profile.name}, a {profile.species}.",
        f"Personality: {traits_str}.",
        f"Backstory: {profile.backstory}",
        f"Speaking style: {profile.speaking_style}",
    ]
    if history_summary:
        lines.append(f"Previous conversation context: {history_summary}")
    lines.append("Stay fully in character at all times.")
    return "\n".join(lines)


async def _load_profile(profile_id: str) -> CreatureProfile | None:
    """Load a CreatureProfile from Supabase by ID."""
    response = (
        supabase_client.table("creature_profiles")
        .select("*")
        .eq("id", profile_id)
        .limit(1)
        .execute()
    )
    rows: list[dict] = response.data or []
    if not rows:
        return None
    from app.services.character_engine import _row_to_profile
    return _row_to_profile(rows[0])


async def _load_history_summary(profile_id: str) -> str | None:
    """Load the most recent session summary for a profile."""
    response = (
        supabase_client.table("session_summaries")
        .select("summary")
        .eq("creature_profile_id", profile_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows: list[dict] = response.data or []
    if not rows:
        return None
    return rows[0].get("summary")


async def _save_transcript_summary(
    profile: CreatureProfile,
    transcript: str,
) -> None:
    """Save a transcript summary to session_summaries."""
    summary = transcript[:500]
    now_iso = datetime.now(timezone.utc).isoformat()
    supabase_client.table("session_summaries").insert(
        {
            "user_id": profile.user_id,
            "creature_profile_id": profile.id,
            "summary": summary,
            "created_at": now_iso,
        }
    ).execute()


async def _open_elevenlabs_ws(
    system_prompt: str,
    voice_id: str,
) -> websockets.WebSocketClientProtocol:
    """Open an ElevenLabs ConvAI WebSocket with retry logic (3 attempts, exponential backoff)."""
    url = f"{ELEVENLABS_CONVAI_URL}?agent_id={voice_id}"
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
                    "tts": {"voice_id": voice_id},
                },
            }
            await el_ws.send(json.dumps(init_msg))
            return el_ws
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "ElevenLabs ConvAI WebSocket attempt %d failed: %s", attempt, exc
            )
            if attempt < 3:
                await asyncio.sleep(backoff_seconds[attempt - 1])

    raise RuntimeError(
        f"ElevenLabs ConvAI WebSocket failed after 3 attempts: {last_exc}"
    )


async def run_session(websocket: WebSocket, profile_id: str) -> None:
    """
    Proxy a voice session between the client WebSocket and ElevenLabs ConvAI.

    Loads the creature profile and conversation history, opens the ElevenLabs
    WebSocket, then bidirectionally pipes messages until either side disconnects.
    Saves a transcript summary on session close.
    """
    await websocket.accept()

    # Load profile
    profile = await _load_profile(profile_id)
    if profile is None:
        await websocket.send_text(
            json.dumps({"type": "error", "detail": "Profile not found."})
        )
        await websocket.close()
        return

    # Load history summary
    history_summary = await _load_history_summary(profile_id)

    # Build system prompt
    system_prompt = build_system_prompt(profile, history_summary)

    # Open ElevenLabs WebSocket
    try:
        el_ws = await _open_elevenlabs_ws(system_prompt, profile.voice_id)
    except RuntimeError as exc:
        logger.error("Failed to open ElevenLabs WebSocket: %s", exc)
        await websocket.send_text(
            json.dumps({"type": "error", "detail": "Voice service unavailable."})
        )
        await websocket.close()
        return

    accumulated_transcript: list[str] = []

    async def client_to_elevenlabs() -> None:
        """Forward messages from the client to ElevenLabs."""
        try:
            while True:
                data = await websocket.receive_bytes()
                await el_ws.send(data)
        except Exception:
            pass

    async def elevenlabs_to_client() -> None:
        """Forward messages from ElevenLabs to the client; accumulate transcript."""
        try:
            async for raw in el_ws:
                # Forward raw frame to client
                if isinstance(raw, bytes):
                    await websocket.send_bytes(raw)
                else:
                    await websocket.send_text(raw)
                    # Try to extract agent text for transcript
                    try:
                        msg = json.loads(raw)
                        if msg.get("type") == "agent_response":
                            text: str = msg.get("agent_response_event", {}).get(
                                "agent_response", ""
                            )
                            if text:
                                accumulated_transcript.append(text)
                    except (json.JSONDecodeError, AttributeError):
                        pass
        except Exception:
            pass

    # Run both directions concurrently; stop when either finishes
    client_task = asyncio.create_task(client_to_elevenlabs())
    el_task = asyncio.create_task(elevenlabs_to_client())

    try:
        done, pending = await asyncio.wait(
            [client_task, el_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    finally:
        # Close ElevenLabs WebSocket
        try:
            await el_ws.close()
        except Exception:
            pass

        # Save transcript summary
        if accumulated_transcript:
            full_transcript = " ".join(accumulated_transcript)
            try:
                await _save_transcript_summary(profile, full_transcript)
            except Exception as exc:
                logger.error("Failed to save transcript summary: %s", exc)

        # Close client WebSocket if still open
        try:
            await websocket.close()
        except Exception:
            pass
