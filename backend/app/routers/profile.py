from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.db.supabase_client import supabase_client
from app.services import character_engine
from app.services.vision_engine import IdentificationResult

logger = logging.getLogger(__name__)

router = APIRouter()


class ProfileRequest(BaseModel):
    identification_result: IdentificationResult
    gps: dict | None = None  # {"lat": float, "lng": float}


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


@router.post("/profile", response_model=character_engine.CreatureProfile)
async def get_or_create_profile(
    body: ProfileRequest,
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    try:
        user_id = await _validate_jwt(authorization)
        profile = await character_engine.get_or_create_profile(
            user_id=user_id,
            identification=body.identification_result,
            gps=body.gps,
        )
        return JSONResponse(content=profile.model_dump())
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error in POST /api/profile")
        raise HTTPException(status_code=500, detail="An unexpected error occurred.")
