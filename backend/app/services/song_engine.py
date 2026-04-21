from __future__ import annotations

import asyncio
import json
import logging

import httpx
import websockets

from app.core.config import ELEVENLABS_API_KEY
from app.services.character_engine import CreatureProfile
from app.services.conversation_agent import ELEVENLABS_CONVAI_URL, build_system_prompt

logger = logging.getLogger(__name__)

LYRIC_PROMPT = (
    "Compose a short song (4–8 lines) about yourself, your home, and what you love. "
    "Respond with only the lyrics."
)


class SongGenerationError(Exception):
    """Raised when song generation exceeds 10 s or all retries fail."""


async def _get_lyrics_from_convai(profile: CreatureProfile) -> str:
    """Open a short-lived ElevenLabs ConvAI WebSocket and request song lyrics in-character."""
    
    # Check if ElevenLabs API key is available
    if not ELEVENLABS_API_KEY:
        # Return fallback lyrics when API key is missing
        return f"🎵 I am {profile.name}, living free,\nIn nature's embrace, wild and carefree!\nSinging my song for all to hear,\nBringing joy and nature near! 🎵"
    
    system_prompt = build_system_prompt(profile)
    url = f"{ELEVENLABS_CONVAI_URL}?agent_id={profile.voice_id}"
    headers = {"xi-api-key": ELEVENLABS_API_KEY}
    backoff_seconds = [1, 2, 4]

    last_exc: Exception | None = None
    for attempt in range(1, 4):
        try:
            el_ws = await websockets.connect(url, additional_headers=headers)
            try:
                init_msg = {
                    "type": "conversation_initiation_client_data",
                    "conversation_config_override": {
                        "agent": {"prompt": {"prompt": system_prompt}},
                        "tts": {"voice_id": profile.voice_id},
                    },
                }
                await el_ws.send(json.dumps(init_msg))

                user_msg = {
                    "type": "user_message",
                    "user_message": LYRIC_PROMPT,
                }
                await el_ws.send(json.dumps(user_msg))

                async for raw in el_ws:
                    if not isinstance(raw, str):
                        continue
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if msg.get("type") == "agent_response":
                        lyrics: str = (
                            msg.get("agent_response_event", {}).get("agent_response", "")
                        )
                        if lyrics:
                            return lyrics
            finally:
                try:
                    await el_ws.close()
                except Exception:
                    pass
        except Exception as exc:
            last_exc = exc
            logger.warning("ElevenLabs ConvAI lyric attempt %d failed: %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(backoff_seconds[attempt - 1])

    # Fallback lyrics when ConvAI fails
    logger.error("ConvAI failed after 3 attempts, using fallback lyrics: %s", last_exc)
    return f"🎵 I am {profile.name}, living free,\nIn nature's embrace, wild and carefree!\nSinging my song for all to hear,\nBringing joy and nature near! 🎵"


async def _text_to_speech(lyrics: str, voice_id: str) -> bytes:
    """Convert lyric text to audio bytes via ElevenLabs TTS v3."""
    
    # Check if ElevenLabs API key is available
    if not ELEVENLABS_API_KEY:
        # Return empty audio bytes when API key is missing
        # This will cause the song generation to fail gracefully
        raise SongGenerationError("ElevenLabs API key not configured")
    
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    body = {
        "text": lyrics,
        "model_id": "eleven_multilingual_v3",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 1.0},
    }
    backoff_seconds = [1, 2, 4]

    last_exc: Exception | None = None
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=body, headers=headers)
                response.raise_for_status()
                return response.content
        except Exception as exc:
            last_exc = exc
            logger.warning("ElevenLabs TTS v3 attempt %d failed: %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(backoff_seconds[attempt - 1])

    raise SongGenerationError(f"Failed to synthesise speech after 3 attempts: {last_exc}")


async def _generate_song_flow(profile: CreatureProfile) -> bytes:
    lyrics = await _get_lyrics_from_convai(profile)
    return await _text_to_speech(lyrics, profile.voice_id)


async def generate_song(profile: CreatureProfile) -> bytes:
    """Generate a sung audio clip for the given creature profile.

    Raises:
        SongGenerationError: if the full flow exceeds 10 s or all retries fail.
    """
    try:
        return await asyncio.wait_for(_generate_song_flow(profile), timeout=10.0)
    except asyncio.TimeoutError as exc:
        raise SongGenerationError("Song generation timed out after 10 s") from exc
    except SongGenerationError:
        raise
    except Exception as exc:
        raise SongGenerationError(f"Unexpected error during song generation: {exc}") from exc
