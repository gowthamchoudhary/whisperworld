from __future__ import annotations

import os

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")
ELEVENLABS_API_KEY: str = os.environ.get("ELEVENLABS_API_KEY", "")
ALLOWED_ORIGINS: str = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
