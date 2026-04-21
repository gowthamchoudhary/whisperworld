from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
from groq import Groq
from pydantic import BaseModel

from app.core.config import ELEVENLABS_API_KEY, GROQ_API_KEY
from app.db.supabase_client import supabase_client
from app.services import location_service
from app.services.vision_engine import IdentificationResult

logger = logging.getLogger(__name__)

ARCHETYPES: dict[str, list[str]] = {
    "flower":   ["warm", "poetic", "romantic"],
    "insect":   ["anxious", "hardworking", "fast-talking"],
    "tree":     ["ancient", "wise", "slow", "philosophical"],
    "squirrel": ["hyperactive", "scattered", "excitable"],
    "mushroom": ["mysterious", "cryptic", "whispery"],
    "bird":     ["free-spirited", "musical", "observant"],
    "default":  ["curious", "gentle", "wondering"],
}

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"


class CreatureProfile(BaseModel):
    id: str
    user_id: str
    species: str
    common_name: str
    category: str
    name: str
    traits: list[str]
    backstory: str
    speaking_style: str
    voice_id: str
    location: dict | None = None  # {"lat": float, "lng": float}
    created_at: str
    last_seen_at: str


async def _generate_personality(
    species: str,
    common_name: str,
    habitat: str,
    archetype_traits: list[str],
) -> dict:
    """Call Groq to generate a creature personality."""
    client = Groq(api_key=GROQ_API_KEY)

    traits_str = ", ".join(archetype_traits)
    prompt = (
        f"You are creating a whimsical nature creature character.\n"
        f"Species: {species} ({common_name})\n"
        f"Habitat: {habitat}\n"
        f"Personality archetype traits: {traits_str}\n\n"
        f"Generate a unique creature personality. Return ONLY a JSON object with exactly these fields:\n"
        f"- name (string): a whimsical creature name\n"
        f"- traits (array of 3 strings): personality traits inspired by the archetype\n"
        f"- backstory (string): a backstory in 100 words or fewer\n"
        f"- speakingStyle (string): a short description of how this creature speaks\n"
    )

    # Call Groq with retry logic
    backoff_seconds = [1, 2, 4]
    last_exc: Exception | None = None
    
    for attempt in range(1, 4):
        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                max_tokens=500,
                temperature=0.7
            )
            
            content = response.choices[0].message.content
            if not content:
                raise ValueError("Empty response from Groq")
            
            return json.loads(content)
            
        except Exception as exc:
            last_exc = exc
            logger.warning("Groq personality generation attempt %d failed: %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(backoff_seconds[attempt - 1])
                continue
            break
    
    # Fallback to default personality
    logger.error("Groq personality generation failed after 3 attempts: %s", last_exc)
    return {
        "name": f"{common_name.title()} Friend",
        "traits": archetype_traits,
        "backstory": f"A friendly {common_name} who loves to chat about nature and life in the {habitat}.",
        "speakingStyle": "friendly and curious"
    }


async def _create_voice(name: str, speaking_style: str, traits: list[str]) -> str:
    """Create an ElevenLabs voice via Voice Design API with retry logic."""
    traits_str = ", ".join(traits)
    body = {
        "voice_description": f"{name} is a {speaking_style} creature with traits: {traits_str}",
        "text": f"Hello, I am {name}. I live in the forest and I love to talk.",
    }
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    url = "https://api.elevenlabs.io/v1/voice-generation/generate-voice"
    backoff_seconds = [1, 2, 4]

    for attempt in range(1, 4):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=body, headers=headers)
                response.raise_for_status()
                data = response.json()
                return data["voice_id"]
        except Exception as exc:
            logger.warning("ElevenLabs Voice Design attempt %d failed: %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(backoff_seconds[attempt - 1])

    logger.error(
        "ElevenLabs Voice Design failed after 3 attempts; falling back to default voice %s",
        DEFAULT_VOICE_ID,
    )
    return DEFAULT_VOICE_ID


async def get_or_create_profile(
    user_id: str,
    identification: IdentificationResult,
    gps: dict | None = None,
) -> CreatureProfile:
    """Get an existing creature profile or create a new one."""
    lat = gps.get("lat") if gps else None
    lng = gps.get("lng") if gps else None

    # Step 1: GPS proximity lookup
    existing_row: dict | None = await location_service.find_nearby_profile(
        user_id=user_id,
        species=identification.species,
        lat=lat,
        lng=lng,
    )

    # Step 2: Fallback — query by user_id + species
    if existing_row is None:
        response = (
            supabase_client.table("creature_profiles")
            .select("*")
            .eq("user_id", user_id)
            .eq("species", identification.species)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows: list[dict] = response.data or []
        if rows:
            existing_row = rows[0]

    # Step 3: Return existing profile after updating last_seen_at
    if existing_row is not None:
        now_iso = datetime.now(timezone.utc).isoformat()
        supabase_client.table("creature_profiles").update(
            {"last_seen_at": now_iso}
        ).eq("id", existing_row["id"]).execute()
        existing_row["last_seen_at"] = now_iso
        return _row_to_profile(existing_row)

    # Step 4: Get archetype traits
    archetype_traits = ARCHETYPES.get(identification.category, ARCHETYPES["default"])

    # Step 5: Generate personality via Groq
    personality = await _generate_personality(
        species=identification.species,
        common_name=identification.common_name,
        habitat=identification.habitat,
        archetype_traits=archetype_traits,
    )

    # Step 6: Create voice via ElevenLabs
    voice_id = await _create_voice(
        name=personality["name"],
        speaking_style=personality["speakingStyle"],
        traits=personality["traits"],
    )

    # Step 7: Persist new profile to Supabase
    now_iso = datetime.now(timezone.utc).isoformat()
    location_value: str | None = None
    if lat is not None and lng is not None:
        location_value = f"POINT({lng} {lat})"

    insert_data: dict = {
        "user_id": user_id,
        "species": identification.species,
        "common_name": identification.common_name,
        "category": identification.category,
        "name": personality["name"],
        "traits": personality["traits"],
        "backstory": personality["backstory"],
        "speaking_style": personality["speakingStyle"],
        "voice_id": voice_id,
        "location": location_value,
        "created_at": now_iso,
        "last_seen_at": now_iso,
    }

    insert_response = (
        supabase_client.table("creature_profiles").insert(insert_data).execute()
    )
    new_row: dict = insert_response.data[0]
    return _row_to_profile(new_row)


def _row_to_profile(row: dict) -> CreatureProfile:
    """Convert a Supabase row dict to a CreatureProfile."""
    raw_location = row.get("location")
    location_dict: dict | None = None
    if isinstance(raw_location, dict):
        coords = raw_location.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            location_dict = {"lat": float(coords[1]), "lng": float(coords[0])}
    elif isinstance(raw_location, str) and raw_location.upper().startswith("POINT"):
        inner = raw_location[raw_location.index("(") + 1: raw_location.index(")")]
        parts = inner.split()
        if len(parts) == 2:
            location_dict = {"lat": float(parts[1]), "lng": float(parts[0])}

    return CreatureProfile(
        id=row["id"],
        user_id=row["user_id"],
        species=row["species"],
        common_name=row["common_name"],
        category=row["category"],
        name=row["name"],
        traits=row["traits"],
        backstory=row["backstory"],
        speaking_style=row["speaking_style"],
        voice_id=row["voice_id"],
        location=location_dict,
        created_at=row["created_at"],
        last_seen_at=row["last_seen_at"],
    )
