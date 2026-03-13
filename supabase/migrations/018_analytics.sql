-- Migration 018: Analytics events + materialized views
-- Table: cc_analytics_events
-- 4 materialized views, cron refresh, RPC cc_track_event

-- =============================================================================
-- TABLE: cc_analytics_events
-- =============================================================================
CREATE TABLE cc_analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES cc_profiles(id) ON DELETE SET NULL,
  session_id TEXT,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cc_analytics_type_date ON cc_analytics_events(event_type, created_at);
CREATE INDEX idx_cc_analytics_user ON cc_analytics_events(user_id);
CREATE INDEX idx_cc_analytics_session ON cc_analytics_events(session_id);

ALTER TABLE cc_analytics_events ENABLE ROW LEVEL SECURITY;
-- No direct reads by users — only via admin RPCs
CREATE POLICY "cc_analytics_admin_select" ON cc_analytics_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM cc_admins WHERE user_id = auth.uid()));

-- =============================================================================
-- RPC: cc_track_event (fire-and-forget from client)
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_track_event(
  p_event_type TEXT,
  p_properties JSONB DEFAULT '{}',
  p_session_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO cc_analytics_events (event_type, user_id, session_id, properties)
  VALUES (p_event_type, COALESCE(p_user_id, auth.uid()), p_session_id, p_properties);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_track_event(TEXT, JSONB, TEXT, UUID) TO anon, authenticated;

-- =============================================================================
-- MATERIALIZED VIEW 1: DAU/MAU (daily active users, monthly active users)
-- =============================================================================
CREATE MATERIALIZED VIEW cc_mv_dau_mau AS
SELECT
  date_trunc('day', g.played_at)::DATE AS day,
  COUNT(DISTINCT g.user_id) AS dau,
  (SELECT COUNT(DISTINCT g2.user_id) FROM cc_games g2
   WHERE g2.played_at >= date_trunc('day', g.played_at) - INTERVAL '30 days'
     AND g2.played_at < date_trunc('day', g.played_at) + INTERVAL '1 day') AS mau
FROM cc_games g
WHERE g.played_at >= NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1;

CREATE UNIQUE INDEX ON cc_mv_dau_mau(day);

-- =============================================================================
-- MATERIALIZED VIEW 2: Games over time (by mode)
-- =============================================================================
CREATE MATERIALIZED VIEW cc_mv_games_over_time AS
SELECT
  date_trunc('day', played_at)::DATE AS day,
  mode,
  COUNT(*) AS game_count
FROM cc_games
WHERE played_at >= NOW() - INTERVAL '90 days'
GROUP BY 1, 2
ORDER BY 1;

CREATE UNIQUE INDEX ON cc_mv_games_over_time(day, mode);

-- =============================================================================
-- MATERIALIZED VIEW 3: Party metrics
-- =============================================================================
CREATE MATERIALIZED VIEW cc_mv_party_metrics AS
SELECT
  date_trunc('day', r.created_at)::DATE AS day,
  COUNT(*) AS rooms_created,
  COUNT(*) FILTER (WHERE r.status = 'finished') AS rooms_completed,
  ROUND(AVG(player_count)::NUMERIC, 1) AS avg_players
FROM cc_party_rooms r
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS player_count FROM cc_party_players WHERE room_id = r.id
) pc ON TRUE
WHERE r.created_at >= NOW() - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1;

CREATE UNIQUE INDEX ON cc_mv_party_metrics(day);

-- =============================================================================
-- MATERIALIZED VIEW 4: Movie difficulty (hit rate per movie)
-- =============================================================================
CREATE MATERIALIZED VIEW cc_mv_movie_difficulty AS
SELECT
  m.id AS movie_id,
  m.title,
  m.diff,
  COUNT(DISTINCT g.id) AS times_played,
  ROUND(AVG(CASE WHEN (mp->>'guessed')::BOOLEAN THEN 1 ELSE 0 END) * 100, 1) AS hit_rate,
  ROUND(AVG(CASE WHEN (mp->>'guessed')::BOOLEAN THEN (mp->>'clue_revealed')::INT + 1 ELSE NULL END), 1) AS avg_clue
FROM cc_movies m
LEFT JOIN cc_games g ON TRUE
LEFT JOIN LATERAL jsonb_array_elements(g.movies_played) AS mp ON (mp->>'movie_id')::INT = m.id
WHERE g.played_at >= NOW() - INTERVAL '90 days'
GROUP BY m.id, m.title, m.diff
ORDER BY times_played DESC;

CREATE UNIQUE INDEX ON cc_mv_movie_difficulty(movie_id);

-- =============================================================================
-- CRON: Refresh materialized views hourly
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'refresh-analytics-views',
      '15 * * * *',
      $$
        REFRESH MATERIALIZED VIEW CONCURRENTLY cc_mv_dau_mau;
        REFRESH MATERIALIZED VIEW CONCURRENTLY cc_mv_games_over_time;
        REFRESH MATERIALIZED VIEW CONCURRENTLY cc_mv_party_metrics;
        REFRESH MATERIALIZED VIEW CONCURRENTLY cc_mv_movie_difficulty;
      $$
    );
  END IF;
END $$;

-- =============================================================================
-- Admin RPCs for analytics views
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_admin_dau_mau(p_days INT DEFAULT 30)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.day), '[]'::json)
    FROM (SELECT * FROM cc_mv_dau_mau WHERE day >= NOW() - (p_days || ' days')::INTERVAL) r
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_admin_dau_mau(INT) TO authenticated;

CREATE OR REPLACE FUNCTION cc_admin_games_over_time(p_days INT DEFAULT 30)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.day), '[]'::json)
    FROM (SELECT * FROM cc_mv_games_over_time WHERE day >= NOW() - (p_days || ' days')::INTERVAL) r
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_admin_games_over_time(INT) TO authenticated;

CREATE OR REPLACE FUNCTION cc_admin_party_metrics(p_days INT DEFAULT 30)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.day), '[]'::json)
    FROM (SELECT * FROM cc_mv_party_metrics WHERE day >= NOW() - (p_days || ' days')::INTERVAL) r
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_admin_party_metrics(INT) TO authenticated;
