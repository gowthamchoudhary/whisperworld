from __future__ import annotations

import os
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()

@router.get("/debug/env")
async def debug_environment():
    """Debug endpoint to check environment variables (without exposing secrets)."""
    return JSONResponse(content={
        "groq_api_key_set": bool(os.environ.get("GROQ_API_KEY")),
        "groq_api_key_length": len(os.environ.get("GROQ_API_KEY", "")),
        "elevenlabs_api_key_set": bool(os.environ.get("ELEVENLABS_API_KEY")),
        "elevenlabs_api_key_length": len(os.environ.get("ELEVENLABS_API_KEY", "")),
        "supabase_url_set": bool(os.environ.get("SUPABASE_URL")),
        "allowed_origins": os.environ.get("ALLOWED_ORIGINS", "not_set"),
    })