from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
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


@router.post("/sing")
async def sing(
    body: SingRequest,
) -> Response:
    try:
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
