from __future__ import annotations

import logging

from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

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


@router.post("/identify", response_model=list[IdentificationResult])
async def identify_creature(
    file: UploadFile,
    lat: float | None = Form(default=None),
    lng: float | None = Form(default=None),
) -> JSONResponse:
    try:
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
