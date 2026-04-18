from __future__ import annotations

import math
from typing import TypedDict

from app.db.supabase_client import supabase_client


class CreatureProfileRow(TypedDict, total=False):
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
    location: str | None
    created_at: str
    last_seen_at: str


def _haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return the great-circle distance in metres between two WGS-84 points."""
    earth_radius_m = 6_371_000.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return earth_radius_m * c


async def find_nearby_profile(
    user_id: str,
    species: str,
    lat: float | None,
    lng: float | None,
) -> dict | None:
    """Find an existing creature profile within 50 m of the given coordinates.

    Returns the most-recently-created matching row as a plain dict, or ``None``
    when GPS is unavailable or no profile is found within the radius.

    Args:
        user_id: The authenticated user's UUID.
        species: Scientific species name to match.
        lat: WGS-84 latitude of the current observation, or ``None``.
        lng: WGS-84 longitude of the current observation, or ``None``.
    """
    if lat is None or lng is None:
        return None

    # Fetch all profiles for this user+species combination.
    # The composite index on (user_id, species) makes this efficient.
    # We then apply haversine filtering in Python as a fallback for environments
    # where PostGIS ST_DWithin is not available via supabase-py filters.
    response = (
        supabase_client.table("creature_profiles")
        .select("*")
        .eq("user_id", user_id)
        .eq("species", species)
        .order("created_at", desc=True)
        .execute()
    )

    rows: list[dict] = response.data or []

    radius_m = 50.0

    for row in rows:
        raw_location = row.get("location")
        if not raw_location:
            continue

        # PostGIS geography columns are returned as GeoJSON or WKT by supabase-py.
        # Handle both GeoJSON dict and WKT string representations.
        row_lat, row_lng = _parse_location(raw_location)
        if row_lat is None or row_lng is None:
            continue

        distance = _haversine_distance(lat, lng, row_lat, row_lng)
        if distance <= radius_m:
            return row

    return None


def _parse_location(location: object) -> tuple[float | None, float | None]:
    """Extract (lat, lng) from a PostGIS geography value returned by supabase-py.

    Supabase may return the geography column as:
    - A GeoJSON dict: ``{"type": "Point", "coordinates": [lng, lat]}``
    - A WKT string:   ``"POINT(lng lat)"``

    Returns ``(None, None)`` if the format is unrecognised.
    """
    if isinstance(location, dict):
        # GeoJSON — coordinates are [longitude, latitude]
        coords = location.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) >= 2:
            return float(coords[1]), float(coords[0])

    if isinstance(location, str):
        # WKT: POINT(lng lat)
        location = location.strip()
        if location.upper().startswith("POINT"):
            inner = location[location.index("(") + 1 : location.index(")")]
            parts = inner.split()
            if len(parts) == 2:
                return float(parts[1]), float(parts[0])

    return None, None
