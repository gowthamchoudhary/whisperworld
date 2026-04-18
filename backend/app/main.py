from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import ambient as ambient_router
from app.routers import identify as identify_router
from app.routers import profile as profile_router
from app.routers import session as session_router
from app.routers import sing as sing_router

load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(title="WhisperWorld API")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
allowed_origins: list[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(ambient_router.router, prefix="/api")
app.include_router(identify_router.router, prefix="/api")
app.include_router(profile_router.router, prefix="/api")
app.include_router(sing_router.router, prefix="/api")
app.include_router(session_router.router)  # WebSocket routes use /ws/session path directly


@app.get("/health")
async def health_check() -> dict[str, str]:
    try:
        return {"status": "ok"}
    except Exception:
        logger.exception("Unexpected error in health check")
        raise
