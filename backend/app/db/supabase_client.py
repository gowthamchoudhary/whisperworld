from __future__ import annotations

import os

from supabase import Client, create_client


def get_supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return create_client(url, key)


supabase_client: Client = get_supabase_client()
