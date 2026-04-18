-- Enable PostGIS extension for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- creature_profiles: stores generated creature identities per user
CREATE TABLE creature_profiles (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    species           text        NOT NULL,
    common_name       text        NOT NULL,
    category          text        NOT NULL CHECK (category IN ('flower', 'insect', 'tree', 'squirrel', 'mushroom', 'bird', 'default')),
    name              text        NOT NULL,
    traits            text[]      NOT NULL DEFAULT '{}',
    backstory         text        NOT NULL DEFAULT '',
    speaking_style    text        NOT NULL DEFAULT '',
    voice_id          text        NOT NULL,
    location          geography(POINT, 4326),
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_seen_at      timestamptz NOT NULL DEFAULT now()
);

-- session_summaries: stores post-session conversation summaries
CREATE TABLE session_summaries (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creature_profile_id   uuid        NOT NULL REFERENCES creature_profiles(id) ON DELETE CASCADE,
    summary               text        NOT NULL DEFAULT '',
    duration_seconds      integer     NOT NULL DEFAULT 0,
    key_topics            text[]      NOT NULL DEFAULT '{}',
    created_at            timestamptz NOT NULL DEFAULT now()
);

-- Composite B-tree index for species+user lookup (used by Location_Service fallback)
CREATE INDEX idx_creature_profiles_user_species
    ON creature_profiles (user_id, species);

-- GIST index for PostGIS spatial queries (ST_DWithin proximity search)
CREATE INDEX idx_creature_profiles_location
    ON creature_profiles USING GIST (location)
    WHERE location IS NOT NULL;
