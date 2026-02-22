-- Migration 012: Duel preferences + notification support
-- Adds duels_enabled toggle to profiles, updates cc_create_duel validation,
-- adds cc_get_duel_notifications RPC

-- =============================================================================
-- Add duels_enabled to cc_profiles
-- =============================================================================
ALTER TABLE cc_profiles ADD COLUMN duels_enabled BOOLEAN NOT NULL DEFAULT true;

-- =============================================================================
-- Update cc_create_duel to check opponent accepts duels
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_create_duel(
  p_challenger_id UUID,
  p_opponent_username TEXT,
  p_challenger_score INT,
  p_challenger_results JSONB
)
RETURNS JSON AS $$
DECLARE
  v_opponent RECORD;
  v_movie_ids UUID[];
  v_movies JSONB;
  v_duel_id UUID;
  v_game_result JSON;
  v_max_possible INT;
BEGIN
  -- Find opponent
  SELECT id, duels_enabled INTO v_opponent FROM cc_profiles WHERE username = p_opponent_username;
  IF v_opponent.id IS NULL THEN
    RAISE EXCEPTION 'Opponent not found';
  END IF;
  IF v_opponent.id = p_challenger_id THEN
    RAISE EXCEPTION 'Cannot duel yourself';
  END IF;
  IF NOT v_opponent.duels_enabled THEN
    RAISE EXCEPTION 'Este usuario no acepta duelos';
  END IF;

  -- Extract movie_ids from results
  SELECT array_agg((r->>'movie_id')::UUID)
  INTO v_movie_ids
  FROM jsonb_array_elements(p_challenger_results) AS r;

  -- Freeze full movie objects
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'title', m.title,
      'alt', m.alt,
      'clues', m.clues,
      'diff', m.diff,
      'lb', m.lb,
      'year', m.year
    )
  ) INTO v_movies
  FROM cc_movies m
  WHERE m.id = ANY(v_movie_ids);

  -- Insert duel
  INSERT INTO cc_duels (challenger_id, opponent_id, challenger_score, challenger_results, movies, expires_at)
  VALUES (p_challenger_id, v_opponent.id, p_challenger_score, p_challenger_results, v_movies, NOW() + INTERVAL '12 hours')
  RETURNING id INTO v_duel_id;

  -- Record game for challenger progression
  v_max_possible := jsonb_array_length(p_challenger_results) * 5;
  SELECT cc_complete_game(
    p_challenger_id,
    'duel',
    p_challenger_score,
    v_max_possible,
    p_challenger_results
  ) INTO v_game_result;

  RETURN json_build_object(
    'duel_id', v_duel_id,
    'game_result', v_game_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- RPC: cc_get_duel_notifications(p_user_id)
-- Returns pending duels with urgency flag (< 1h left)
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_get_duel_notifications(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  -- Auto-expire stale
  UPDATE cc_duels SET status = 'expired'
  WHERE status = 'waiting' AND expires_at < NOW();

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
      WHERE d.opponent_id = p_user_id
        AND d.status = 'waiting'
        AND d.expires_at > NOW()
      ORDER BY d.expires_at ASC
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_get_duel_notifications(UUID) TO authenticated;

-- =============================================================================
-- Update cc_search_users to include duels_enabled
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_search_users(p_query TEXT, p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_data), '[]'::json) FROM (
      SELECT json_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'elo', p.elo,
        'level', p.level,
        'avatar_url', p.avatar_url,
        'duels_enabled', p.duels_enabled
      ) AS row_data
      FROM cc_profiles p
      WHERE p.id != p_user_id
        AND (p.username ILIKE '%' || p_query || '%' OR p.display_name ILIKE '%' || p_query || '%')
        AND NOT p.username LIKE 'user_%'
      ORDER BY p.elo DESC
      LIMIT 10
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
