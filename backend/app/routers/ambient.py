from __future__ import annotations

import asyncio
import logging

import httpx
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from pydantic import BaseModel

from app.core.config import ELEVENLABS_API_KEY

logger = logging.getLogger(__name__)

router = APIRouter()


class AmbientRequest(BaseModel):
    category: str


AMBIENT_PROMPTS: dict[str, str] = {
    "flower":   "gentle garden breeze with bees and birdsong",
    "insect":   "forest floor ambience with rustling leaves",
    "tree":     "ancient woodland with wind through tall canopy",
    "squirrel": "lively park with rustling leaves and distant children",
    "mushroom": "damp forest floor with dripping water and distant owls",
    "bird":     "open sky with light wind and distant bird calls",
    "default":  "peaceful nature ambience with soft wind",
}

_ELEVENLABS_SOUND_URL = "https://api.elevenlabs.io/v1/sound-generation"


async def _fetch_ambient_audio(prompt: str) -> bytes:
    """Fetch ambient audio from ElevenLabs Sound Effects API with retry logic."""
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    body = {"text": prompt, "duration_seconds": 10, "prompt_influence": 0.3}
    backoff_seconds = [1, 2, 4]

    last_exc: Exception | None = None
    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(_ELEVENLABS_SOUND_URL, json=body, headers=headers)
                response.raise_for_status()
                return response.content
        except Exception as exc:
            last_exc = exc
            logger.warning("ElevenLabs Sound Effects attempt %d failed: %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(backoff_seconds[attempt - 1])

    raise RuntimeError(f"ElevenLabs Sound Effects failed after 3 attempts: {last_exc}")


@router.post("/ambient")
async def create_ambient_sound(body: AmbientRequest) -> Response:
    """Return ambient background audio for the given creature category.

    Returns 200 with audio/mpeg on success, or 204 (no content) on failure
    so the frontend can proceed silently without blocking the voice session.
    """
    prompt = AMBIENT_PROMPTS.get(body.category, AMBIENT_PROMPTS["default"])
    
    # Check if ElevenLabs API key is available
    if not ELEVENLABS_API_KEY:
        logger.warning("ELEVENLABS_API_KEY not set, skipping ambient sound generation")
        return Response(status_code=204)
    
    try:
        audio_bytes = await _fetch_ambient_audio(prompt)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        logger.error("Ambient sound generation failed for category=%s: %s", body.category, exc)
        return Response(status_code=204)


@router.get("/ambient")
async def get_ambient_sound(category: str = "default") -> Response:
    """Return ambient background audio for the given creature category.

    Returns 200 with audio/mpeg on success, or 204 (no content) on failure
    so the frontend can proceed silently without blocking the voice session.
    """
    prompt = AMBIENT_PROMPTS.get(category, AMBIENT_PROMPTS["default"])
    
    # Check if ElevenLabs API key is available
    if not ELEVENLABS_API_KEY:
        logger.warning("ELEVENLABS_API_KEY not set, skipping ambient sound generation")
        return Response(status_code=204)
    
    try:
        audio_bytes = await _fetch_ambient_audio(prompt)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as exc:
        logger.error("Ambient sound generation failed for category=%s: %s", category, exc)
        return Response(status_code=204)
