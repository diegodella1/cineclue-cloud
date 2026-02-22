-- 015_performance.sql: Duel expiry cron, remove UPDATE from polling RPCs, indexes

-- ============================================================
-- P3/RT-1: Duel expiry cron job (every 5 min)
-- ============================================================
SELECT cron.schedule(
  'cc-expire-duels',
  '*/5 * * * *',
  $$UPDATE cc_duels SET status = 'expired' WHERE status = 'waiting' AND expires_at < NOW()$$
);

-- ============================================================
-- Remove UPDATE from cc_get_my_duels (now handled by cron)
-- ============================================================
CREATE OR REPLACE FUNCTION cc_get_my_duels(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY sort_order, created_at DESC), '[]'::json) FROM (
      SELECT json_build_object(
        'id', d.id, 'status', d.status,
        'challenger', json_build_object('id', cp.id, 'username', cp.username, 'display_name', cp.display_name, 'elo', cp.elo, 'avatar_url', cp.avatar_url),
        'opponent', json_build_object('id', op.id, 'username', op.username, 'display_name', op.display_name, 'elo', op.elo, 'avatar_url', op.avatar_url),
        'challenger_score', d.challenger_score, 'opponent_score', d.opponent_score,
        'winner_id', d.winner_id, 'created_at', d.created_at,
        'expires_at', d.expires_at, 'completed_at', d.completed_at,
        'duel_status', CASE
          WHEN d.status = 'waiting' AND d.opponent_id = p_user_id THEN 'pending'
          WHEN d.status = 'waiting' AND d.challenger_id = p_user_id THEN 'sent'
          WHEN d.status = 'completed' THEN 'completed'
          WHEN d.status = 'expired' THEN 'expired'
        END
      ) AS row_data,
      CASE
        WHEN d.status = 'waiting' AND d.opponent_id = p_user_id THEN 0
        WHEN d.status = 'waiting' AND d.challenger_id = p_user_id THEN 1
        WHEN d.status = 'completed' THEN 2
        ELSE 3
      END AS sort_order,
      d.created_at
      FROM cc_duels d
      JOIN cc_profiles cp ON cp.id = d.challenger_id
      JOIN cc_profiles op ON op.id = d.opponent_id
      WHERE d.challenger_id = p_user_id OR d.opponent_id = p_user_id
      ORDER BY sort_order, d.created_at DESC
      LIMIT 50
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- Remove UPDATE from cc_get_duel_notifications (now handled by cron)
-- ============================================================
CREATE OR REPLACE FUNCTION cc_get_duel_notifications(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_data), '[]'::json) FROM (
      SELECT json_build_object(
        'id', d.id,
        'challenger_username', cp.username,
        'challenger_display_name', cp.display_name,
        'expires_at', d.expires_at,
        'urgent', (d.expires_at - NOW()) < INTERVAL '1 hour',
        'minutes_left', GREATEST(0, EXTRACT(EPOCH FROM (d.expires_at - NOW())) / 60)::INT
      ) AS row_data
      FROM cc_duels d
      JOIN cc_profiles cp ON cp.id = d.challenger_id
      WHERE d.opponent_id = p_user_id AND d.status = 'waiting' AND d.expires_at > NOW()
      ORDER BY d.expires_at ASC
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- P4/P5: Indexes for cc_games
-- ============================================================

-- Index for user's games (used in admin, mission checks, etc.)
CREATE INDEX IF NOT EXISTS idx_cc_games_user_id ON cc_games (user_id);

-- Index for date-based queries (admin dashboard, daily checks)
CREATE INDEX IF NOT EXISTS idx_cc_games_played_at ON cc_games (played_at) WHERE completed;

-- Index for daily replay prevention
CREATE INDEX IF NOT EXISTS idx_cc_games_daily ON cc_games (user_id, played_at)
  WHERE mode = 'daily' AND completed;

-- Index for duel expiry cron
CREATE INDEX IF NOT EXISTS idx_cc_duels_waiting ON cc_duels (status, expires_at)
  WHERE status = 'waiting';

-- Index for duel lookups by participant
CREATE INDEX IF NOT EXISTS idx_cc_duels_challenger ON cc_duels (challenger_id);
CREATE INDEX IF NOT EXISTS idx_cc_duels_opponent ON cc_duels (opponent_id);
