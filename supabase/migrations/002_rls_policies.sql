-- Enable Row Level Security on both tables
ALTER TABLE creature_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS policies for creature_profiles
-- ============================================================

CREATE POLICY creature_profiles_select_own
    ON creature_profiles
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY creature_profiles_insert_own
    ON creature_profiles
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY creature_profiles_update_own
    ON creature_profiles
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY creature_profiles_delete_own
    ON creature_profiles
    FOR DELETE
    USING (user_id = auth.uid());

-- ============================================================
-- RLS policies for session_summaries
-- ============================================================

CREATE POLICY session_summaries_select_own
    ON session_summaries
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY session_summaries_insert_own
    ON session_summaries
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY session_summaries_update_own
    ON session_summaries
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY session_summaries_delete_own
    ON session_summaries
    FOR DELETE
    USING (user_id = auth.uid());
