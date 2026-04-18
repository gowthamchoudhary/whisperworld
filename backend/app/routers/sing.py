from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.db.supabase_client import supabase_client
from app.services import song_engine
from app.services.character_engine import CreatureProfile, _row_to_profile
from app.services.song_engine import SongGenerationError

logger = logging.getLogger(__name__)

router = APIRouter()


class SingRequest(BaseModel):
    profile_id: str


async def _validate_jwt(authorization: str | None) -> str:
    """Validate Bearer JWT via Supabase; return user_id or raise 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        response = supabase_client.auth.get_user(token)
        if response is None or response.user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token.")
        return response.user.id
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("JWT validation error: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token.") from exc


@router.post("/sing")
async def sing(
    body: SingRequest,
    authorization: str | None = Header(default=None),
) -> Response:
    try:
        await _validate_jwt(authorization)

        result = (
            supabase_client.table("creature_profiles")
            .select("*")
            .eq("id", body.profile_id)
            .limit(1)
            .execute()
        )
        rows: list[dict] = result.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Creature profile not found.")

        profile: CreatureProfile = _row_to_profile(rows[0])

        audio_bytes: bytes = await song_engine.generate_song(profile)
        return Response(content=audio_bytes, media_type="audio/mpeg")

    except HTTPException:
        raise
    except SongGenerationError:
        logger.warning("SongGenerationError for profile_id=%s", body.profile_id)
        raise HTTPException(
            status_code=504,
            detail="The creature is unable to sing at this time. Please try again.",
        )
    except Exception:
        logger.exception("Unexpected error in POST /api/sing")
        raise HTTPException(status_code=500, detail="An unexpected error occurred.")
