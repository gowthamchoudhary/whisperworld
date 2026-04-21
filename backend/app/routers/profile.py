from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import character_engine
from app.services.vision_engine import IdentificationResult

logger = logging.getLogger(__name__)

router = APIRouter()


class ProfileRequest(BaseModel):
    identification_result: IdentificationResult
    gps: dict | None = None  # {"lat": float, "lng": float}


@router.post("/profile", response_model=character_engine.CreatureProfile)
async def get_or_create_profile(
    body: ProfileRequest,
) -> JSONResponse:
    try:
        # Use a default user_id for open access
        user_id = "anonymous_user"
        
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
