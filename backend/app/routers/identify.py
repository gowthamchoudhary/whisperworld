from __future__ import annotations

import logging

from fastapi import APIRouter, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.db.supabase_client import supabase_client
from app.services.vision_engine import (
    IdentificationResult,
    NoCreatureError,
    VisionUnavailableError,
    identify,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


async def _validate_jwt(authorization: str | None) -> None:
    """Validate Bearer JWT via Supabase; raise 401 if invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        response = supabase_client.auth.get_user(token)
        if response is None or response.user is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("JWT validation error: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token.") from exc


@router.post("/identify", response_model=list[IdentificationResult])
async def identify_creature(
    file: UploadFile,
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    try:
        await _validate_jwt(authorization)

        if file.content_type not in _ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=422,
                detail="Unsupported file type. Please upload JPEG, PNG, WebP, or HEIC.",
            )

        image_bytes = await file.read()

        if len(image_bytes) > _MAX_SIZE_BYTES:
            raise HTTPException(
                status_code=422,
                detail="File too large. Maximum size is 10 MB.",
            )

        results = await identify(image_bytes)
        return JSONResponse(content=[r.model_dump() for r in results])

    except HTTPException:
        raise
    except NoCreatureError:
        raise HTTPException(
            status_code=422,
            detail="No living creature detected in this photo.",
        )
    except VisionUnavailableError:
        raise HTTPException(
            status_code=503,
            detail="Vision service is currently unavailable.",
        )
    except Exception:
        logger.exception("Unexpected error in POST /api/identify")
        raise HTTPException(status_code=500, detail="An unexpected error occurred.")
