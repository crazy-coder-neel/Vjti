-- =============================================================================
-- SpoonSense & NeuroMind — Unified Master PostgreSQL Database Schema
-- =============================================================================
-- Description:  Single, unified, idempotent SQL migration for Supabase.
--               Contains all tables, views, triggers, indexes, and RLS policies
--               required across all 5 milestones.
--
-- How to apply: Copy and paste this ENTIRE script into the Supabase SQL Editor
--               (Dashboard -> SQL Editor -> New Query -> Run).
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 0. Shared Trigger Functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.spoonsense_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.spoonsense_set_updated_at()
    IS 'Auto-updates updated_at timestamp on row modification.';


-- =============================================================================
-- 1. users_profile — Student profiles mirrored from Supabase Auth
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.users_profile (
    id          TEXT        PRIMARY KEY, -- Matches auth.users.id or demo user ID
    email       TEXT        UNIQUE,
    full_name   TEXT,
    role        TEXT        DEFAULT 'student' CHECK (role IN ('student', 'parent', 'counselor')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_profile_email ON public.users_profile (email);
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_profile_dev_all ON public.users_profile;
CREATE POLICY users_profile_dev_all ON public.users_profile FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_users_profile_updated_at ON public.users_profile;
CREATE TRIGGER trg_users_profile_updated_at
    BEFORE UPDATE ON public.users_profile
    FOR EACH ROW EXECUTE FUNCTION public.spoonsense_set_updated_at();


-- =============================================================================
-- 2. timetable_blocks — Weekly recurring class schedule
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.timetable_blocks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT        NOT NULL,
    weekday     INTEGER     NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Mon, 6=Sun
    start_time  TIME        NOT NULL,
    end_time    TIME        NOT NULL,
    title       TEXT        DEFAULT '',
    source      TEXT        DEFAULT 'manual' CHECK (source IN ('ics', 'photo', 'manual')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT timetable_blocks_valid_time_range CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_timetable_blocks_user_weekday ON public.timetable_blocks (user_id, weekday);
ALTER TABLE public.timetable_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timetable_blocks_dev_all ON public.timetable_blocks;
CREATE POLICY timetable_blocks_dev_all ON public.timetable_blocks FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_timetable_blocks_updated_at ON public.timetable_blocks;
CREATE TRIGGER trg_timetable_blocks_updated_at
    BEFORE UPDATE ON public.timetable_blocks
    FOR EACH ROW EXECUTE FUNCTION public.spoonsense_set_updated_at();


-- =============================================================================
-- 3. commute_profiles — Student daily transit configuration
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.commute_profiles (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT        NOT NULL UNIQUE,
    minutes_each_way    INTEGER     NOT NULL DEFAULT 0 CHECK (minutes_each_way >= 0),
    mode                TEXT        NOT NULL DEFAULT 'seated' CHECK (mode IN ('crowded', 'seated', 'active', 'walk', 'driving', 'transit')),
    days_applicable     INTEGER[]   DEFAULT '{0,1,2,3,4}',
    notes               TEXT        DEFAULT '',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commute_profiles_user ON public.commute_profiles (user_id);
ALTER TABLE public.commute_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commute_profiles_dev_all ON public.commute_profiles;
CREATE POLICY commute_profiles_dev_all ON public.commute_profiles FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_commute_profiles_updated_at ON public.commute_profiles;
CREATE TRIGGER trg_commute_profiles_updated_at
    BEFORE UPDATE ON public.commute_profiles
    FOR EACH ROW EXECUTE FUNCTION public.spoonsense_set_updated_at();


-- =============================================================================
-- 4. day_overrides — One-off date adjustments (sick, WFH, holiday)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.day_overrides (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT        NOT NULL,
    date        DATE        NOT NULL,
    is_sick_day BOOLEAN     DEFAULT false,
    is_wfh      BOOLEAN     DEFAULT false,
    notes       TEXT        DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_day_overrides_user_date UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_day_overrides_user_date ON public.day_overrides (user_id, date);
ALTER TABLE public.day_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS day_overrides_dev_all ON public.day_overrides;
CREATE POLICY day_overrides_dev_all ON public.day_overrides FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 5. tasks — Academic tasks with load weights and reshuffle counts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT            NOT NULL,
    title               TEXT            NOT NULL,
    task_type           TEXT            DEFAULT 'other' CHECK (task_type IN ('reading', 'writing', 'problem_solving', 'admin', 'rest', 'other')),
    difficulty          TEXT            DEFAULT 'normal' CHECK (difficulty IN ('easy', 'normal', 'hard')),
    estimated_minutes   INTEGER         NOT NULL DEFAULT 45 CHECK (estimated_minutes > 0),
    spoon_cost          NUMERIC(4, 2)   NOT NULL DEFAULT 1.0 CHECK (spoon_cost >= 0),
    due_date            DATE,
    is_fixed_deadline   BOOLEAN         DEFAULT false,
    state               TEXT            DEFAULT 'planned' CHECK (state IN ('planned', 'in_progress', 'completed', 'deferred', 'cancelled')),
    reshuffled_count    INTEGER         DEFAULT 0 CHECK (reshuffled_count >= 0),
    scheduled_date      DATE,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_state ON public.tasks (user_id, state);
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_date ON public.tasks (user_id, scheduled_date);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_dev_all ON public.tasks;
CREATE POLICY tasks_dev_all ON public.tasks FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.spoonsense_set_updated_at();


-- =============================================================================
-- 6. task_steps — Shrunk 2-minute micro-steps (Anti-Paralysis)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.task_steps (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID            REFERENCES public.tasks(id) ON DELETE CASCADE,
    position        INTEGER         NOT NULL CHECK (position >= 1),
    text            TEXT            NOT NULL,
    minutes         INTEGER         NOT NULL DEFAULT 2 CHECK (minutes >= 0),
    spoon_cost      NUMERIC(4, 2)   DEFAULT 0.2 CHECK (spoon_cost >= 0),
    why             TEXT            DEFAULT '',
    is_completed    BOOLEAN         DEFAULT false,
    recursion_depth INTEGER         DEFAULT 0,
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_steps_task_pos ON public.task_steps (task_id, position);
ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_steps_dev_all ON public.task_steps;
CREATE POLICY task_steps_dev_all ON public.task_steps FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 7. day_snapshots — Daily capacity equation results (Why Panel)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.day_snapshots (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT            NOT NULL,
    date                DATE            NOT NULL,
    budget              NUMERIC(4, 2)   NOT NULL DEFAULT 12.0,
    commute_cost        NUMERIC(4, 2)   NOT NULL DEFAULT 0.0,
    campus_cost         NUMERIC(4, 2)   NOT NULL DEFAULT 0.0,
    deadline_pressure   NUMERIC(4, 2)   NOT NULL DEFAULT 0.0,
    carryover           NUMERIC(4, 2)   NOT NULL DEFAULT 0.0,
    probe_multiplier    NUMERIC(3, 2)   DEFAULT 1.0,
    prior_spoons        NUMERIC(4, 2)   NOT NULL,
    live_spoons         NUMERIC(4, 2)   NOT NULL,
    manual_override     NUMERIC(4, 2),
    weather             TEXT            NOT NULL CHECK (weather IN ('sunny', 'partly_cloudy', 'cloudy', 'stormy')),
    confidence          NUMERIC(3, 2)   NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
    why_factors         JSONB           NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    CONSTRAINT uq_day_snapshots_user_date UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_day_snapshots_user_date ON public.day_snapshots (user_id, date);
ALTER TABLE public.day_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS day_snapshots_dev_all ON public.day_snapshots;
CREATE POLICY day_snapshots_dev_all ON public.day_snapshots FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 8. game_results — 20s Pulse cognitive probe results
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.game_results (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT            NOT NULL,
    played_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    median_rt   NUMERIC(7, 2),
    lapses      INTEGER         DEFAULT 0,
    variability NUMERIC(7, 2),
    switch_cost NUMERIC(7, 2),
    multiplier  NUMERIC(3, 2)   DEFAULT 1.0,
    valid       BOOLEAN         DEFAULT true,
    summary     JSONB           DEFAULT '{}',
    created_at  TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_results_user_played ON public.game_results (user_id, played_at DESC);
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_results_dev_all ON public.game_results;
CREATE POLICY game_results_dev_all ON public.game_results FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 9. evening_labels — 1-tap evening check-in ratings (carryover calibration)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.evening_labels (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT            NOT NULL,
    date            DATE            NOT NULL,
    label           INTEGER         CHECK (label BETWEEN 1 AND 5),
    label_name      TEXT            DEFAULT '',
    spoons_awarded  NUMERIC(3, 2)   DEFAULT 0.5,
    action          TEXT            DEFAULT 'checkin' CHECK (action IN ('checkin', 'skip')),
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    CONSTRAINT uq_evening_labels_user_date UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_evening_labels_user_date ON public.evening_labels (user_id, date);
ALTER TABLE public.evening_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evening_labels_dev_all ON public.evening_labels;
CREATE POLICY evening_labels_dev_all ON public.evening_labels FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 10. garden_state — The Forgiving Garden (Streak that never wilts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.garden_state (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT        NOT NULL UNIQUE,
    days_tended         INTEGER     NOT NULL DEFAULT 0,
    total_xp            INTEGER     NOT NULL DEFAULT 0,
    current_stage       TEXT        NOT NULL DEFAULT 'seed',
    stage_label         TEXT        NOT NULL DEFAULT 'Tiny Seed',
    stage_emoji         TEXT        NOT NULL DEFAULT '🌱',
    last_active_date    DATE,
    is_hibernating      BOOLEAN     DEFAULT false,
    water_count         INTEGER     DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garden_state_user ON public.garden_state (user_id);
ALTER TABLE public.garden_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS garden_state_dev_all ON public.garden_state;
CREATE POLICY garden_state_dev_all ON public.garden_state FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_garden_state_updated_at ON public.garden_state;
CREATE TRIGGER trg_garden_state_updated_at
    BEFORE UPDATE ON public.garden_state
    FOR EACH ROW EXECUTE FUNCTION public.spoonsense_set_updated_at();


-- =============================================================================
-- 11. dopamine_items — Low-friction off-ramp activities
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.dopamine_items (
    id              TEXT            PRIMARY KEY,
    user_id         TEXT            NOT NULL,
    title           TEXT            NOT NULL,
    emoji           TEXT            DEFAULT '✨',
    spoon_credit    NUMERIC(3, 2)   DEFAULT 0.3 CHECK (spoon_credit BETWEEN 0.1 AND 0.5),
    minutes         INTEGER         DEFAULT 5,
    is_custom       BOOLEAN         DEFAULT false,
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dopamine_items_user ON public.dopamine_items (user_id);
ALTER TABLE public.dopamine_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dopamine_items_dev_all ON public.dopamine_items;
CREATE POLICY dopamine_items_dev_all ON public.dopamine_items FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 12. study_sessions — Deep work sessions and pause timers
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.study_sessions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT        NOT NULL,
    task_name           TEXT        DEFAULT 'Focus Session',
    planned_duration    INTEGER     DEFAULT 90,
    status              TEXT        DEFAULT 'active' CHECK (status IN ('active', 'paused', 'break', 'completed', 'abandoned')),
    started_at          TIMESTAMPTZ DEFAULT NOW(),
    ended_at            TIMESTAMPTZ,
    focus_seconds       INTEGER     DEFAULT 0,
    break_seconds       INTEGER     DEFAULT 0,
    pause_count         INTEGER     DEFAULT 0,
    breaks_log          JSONB       DEFAULT '[]',
    pauses_log          JSONB       DEFAULT '[]',
    stats               JSONB       DEFAULT '{}',
    emotional_start     JSONB,
    emotional_end       JSONB,
    energy_at_start     INTEGER,
    energy_at_end       INTEGER,
    recovery_plan       JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON public.study_sessions (user_id);
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_sessions_dev_all ON public.study_sessions;
CREATE POLICY study_sessions_dev_all ON public.study_sessions FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_study_sessions_updated_at ON public.study_sessions;
CREATE TRIGGER trg_study_sessions_updated_at
    BEFORE UPDATE ON public.study_sessions
    FOR EACH ROW EXECUTE FUNCTION public.spoonsense_set_updated_at();


-- =============================================================================
-- 13. analysis_sessions — Multimodal text/voice sentiment records
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_sessions (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 TEXT,
    input_type              TEXT            DEFAULT 'text' CHECK (input_type IN ('text', 'voice')),
    input_text              TEXT,
    audio_url               TEXT,
    detected_language       TEXT,
    language_name           TEXT,
    transcription_method    TEXT,
    depression_score        NUMERIC(4, 2)   DEFAULT 0.0,
    anxiety_score           NUMERIC(4, 2)   DEFAULT 0.0,
    stress_score            NUMERIC(4, 2)   DEFAULT 0.0,
    depression_level        TEXT            DEFAULT 'low',
    anxiety_level           TEXT            DEFAULT 'low',
    stress_level            TEXT            DEFAULT 'low',
    tone                    TEXT            DEFAULT 'neutral',
    energy_score            INTEGER         DEFAULT 70,
    energy_category         TEXT            DEFAULT 'medium_energy',
    recommended_task_type   TEXT            DEFAULT 'problem_solving',
    task_description        TEXT            DEFAULT '',
    analysis_source         TEXT            DEFAULT 'local_model',
    created_at              TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_sessions_user ON public.analysis_sessions (user_id, created_at DESC);
ALTER TABLE public.analysis_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analysis_sessions_dev_all ON public.analysis_sessions;
CREATE POLICY analysis_sessions_dev_all ON public.analysis_sessions FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 14. energy_history — Historical energy log for trends
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.energy_history (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT,
    session_id      UUID        REFERENCES public.analysis_sessions(id) ON DELETE CASCADE,
    recorded_at     TIMESTAMPTZ DEFAULT NOW(),
    energy_score    INTEGER     NOT NULL,
    energy_category TEXT,
    base_energy     INTEGER,
    stress_impact   INTEGER,
    anxiety_impact  INTEGER,
    depression_impact INTEGER,
    tone_impact     INTEGER,
    total_impact    INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_energy_history_user ON public.energy_history (user_id, recorded_at DESC);
ALTER TABLE public.energy_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS energy_history_dev_all ON public.energy_history;
CREATE POLICY energy_history_dev_all ON public.energy_history FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 15. calendar_sync_events — Google Calendar synced block tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.calendar_sync_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT        NOT NULL,
    task_id         TEXT        NOT NULL,
    google_event_id TEXT        NOT NULL,
    target_date     DATE        NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_cal_user_task UNIQUE (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_sync_user ON public.calendar_sync_events (user_id);
ALTER TABLE public.calendar_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_sync_dev_all ON public.calendar_sync_events;
CREATE POLICY calendar_sync_dev_all ON public.calendar_sync_events FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 16. test_table — Connectivity verification table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.test_table (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        DEFAULT 'test_connection',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.test_table ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS test_table_dev_all ON public.test_table;
CREATE POLICY test_table_dev_all ON public.test_table FOR ALL USING (true) WITH CHECK (true);


-- =============================================================================
-- 17. Analytical Views (with security_invoker = true for Supabase linter compliance)
-- =============================================================================
DROP VIEW IF EXISTS public.latest_sessions CASCADE;
CREATE OR REPLACE VIEW public.latest_sessions
WITH (security_invoker = true)
AS
SELECT
    id,
    user_id,
    input_type,
    LEFT(input_text, 100) AS text_preview,
    depression_score,
    anxiety_score,
    stress_score,
    energy_score,
    energy_category,
    recommended_task_type,
    created_at
FROM public.analysis_sessions
ORDER BY created_at DESC
LIMIT 50;

DROP VIEW IF EXISTS public.daily_energy_avg CASCADE;
CREATE OR REPLACE VIEW public.daily_energy_avg
WITH (security_invoker = true)
AS
SELECT
    DATE(recorded_at) AS date,
    ROUND(AVG(energy_score)) AS avg_energy,
    COUNT(*) AS session_count,
    MODE() WITHIN GROUP (ORDER BY energy_category) AS dominant_category
FROM public.energy_history
GROUP BY DATE(recorded_at)
ORDER BY date DESC;

-- Verification query
SELECT 'SpoonSense master schema migration completed successfully!' AS status;
