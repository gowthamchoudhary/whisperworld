-- Migration 004: Postgres function for PostGIS-backed proximity search
--
-- find_nearby_creature_profile uses ST_DWithin for an accurate spatial query
-- against the geography(POINT, 4326) column.  This is the preferred execution
-- path when PostGIS is available; the Python haversine fallback in
-- location_service.py is used only when this function cannot be called.

CREATE OR REPLACE FUNCTION find_nearby_creature_profile(
    p_user_id  uuid,
    p_species  text,
    p_lat      float8,
    p_lng      float8
)
RETURNS SETOF creature_profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT *
    FROM   creature_profiles
    WHERE  user_id = p_user_id
      AND  species = p_species
      AND  location IS NOT NULL
      AND  ST_DWithin(
               location::geography,
               ST_MakePoint(p_lng, p_lat)::geography,
               50          -- radius in metres
           )
    ORDER BY created_at DESC
    LIMIT 1;
$$;

-- Grant execute to the authenticated role so supabase-py RPC calls work.
GRANT EXECUTE ON FUNCTION find_nearby_creature_profile(uuid, text, float8, float8)
    TO authenticated;
