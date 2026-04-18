-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 90-day retention policy (Requirement 5.6):
-- Session summaries and creature profiles that have not been active for 90 days
-- are automatically purged to limit storage growth and protect user privacy.
-- This job runs daily at midnight UTC.
SELECT cron.schedule(
    'whisperworld-retention-cleanup',
    '0 0 * * *',
    $$
        -- Remove old session summaries
        DELETE FROM session_summaries
        WHERE created_at < NOW() - INTERVAL '90 days';

        -- Remove orphaned creature profiles with no recent activity
        DELETE FROM creature_profiles
        WHERE last_seen_at < NOW() - INTERVAL '90 days';
    $$
);
