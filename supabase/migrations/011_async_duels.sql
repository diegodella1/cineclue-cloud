-- Migration 011: Async remote duels
-- Tabla cc_duels + 6 RPCs + RLS + indexes

-- =============================================================================
-- TABLE: cc_duels
-- =============================================================================
CREATE TABLE cc_duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id UUID NOT NULL REFERENCES cc_profiles(id),
  opponent_id UUID NOT NULL REFERENCES cc_profiles(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','completed','expired')),
  movies JSONB NOT NULL,
  challenger_score INT NOT NULL,
  challenger_results JSONB NOT NULL,
  opponent_score INT,
  opponent_results JSONB,
  winner_id UUID REFERENCES cc_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_cc_duels_challenger ON cc_duels(challenger_id);
CREATE INDEX idx_cc_duels_opponent ON cc_duels(opponent_id);
CREATE INDEX idx_cc_duels_status_expires ON cc_duels(status, expires_at);

-- RLS: users can only see duels where they are challenger or opponent
ALTER TABLE cc_duels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own duels" ON cc_duels
  FOR SELECT USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

-- No direct INSERT/UPDATE/DELETE — all via RPCs (SECURITY DEFINER)

-- =============================================================================
-- Extend cc_games mode to include 'duel'
-- =============================================================================
ALTER TABLE cc_games DROP CONSTRAINT cc_games_mode_check;
ALTER TABLE cc_games ADD CONSTRAINT cc_games_mode_check CHECK (mode IN ('solo','daily','duel_local','duel'));

-- =============================================================================
-- RPC 1: cc_search_users(p_query, p_user_id)
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
        'avatar_url', p.avatar_url
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

GRANT EXECUTE ON FUNCTION cc_search_users(TEXT, UUID) TO authenticated;

-- =============================================================================
-- RPC 2: cc_create_duel(p_challenger_id, p_opponent_username, p_challenger_score, p_challenger_results)
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_create_duel(
  p_challenger_id UUID,
  p_opponent_username TEXT,
  p_challenger_score INT,
  p_challenger_results JSONB
)
RETURNS JSON AS $$
DECLARE
  v_opponent_id UUID;
  v_movie_ids INT[];
  v_movies JSONB;
  v_duel_id UUID;
  v_game_result JSON;
  v_max_possible INT;
BEGIN
  -- Find opponent
  SELECT id INTO v_opponent_id FROM cc_profiles WHERE username = p_opponent_username;
  IF v_opponent_id IS NULL THEN
    RAISE EXCEPTION 'Opponent not found';
  END IF;
  IF v_opponent_id = p_challenger_id THEN
    RAISE EXCEPTION 'Cannot duel yourself';
  END IF;

  -- Extract movie_ids from results
  SELECT array_agg((r->>'movie_id')::INT)
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
      'decade', m.decade
    )
  ) INTO v_movies
  FROM cc_movies m
  WHERE m.id = ANY(v_movie_ids);

  -- Insert duel
  INSERT INTO cc_duels (challenger_id, opponent_id, challenger_score, challenger_results, movies, expires_at)
  VALUES (p_challenger_id, v_opponent_id, p_challenger_score, p_challenger_results, v_movies, NOW() + INTERVAL '12 hours')
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

GRANT EXECUTE ON FUNCTION cc_create_duel(UUID, TEXT, INT, JSONB) TO authenticated;

-- =============================================================================
-- RPC 3: cc_get_duel(p_duel_id, p_user_id)
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_get_duel(p_duel_id UUID, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_duel RECORD;
  v_challenger JSON;
  v_opponent JSON;
BEGIN
  SELECT * INTO v_duel FROM cc_duels WHERE id = p_duel_id;
  IF v_duel IS NULL THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;
  IF p_user_id != v_duel.challenger_id AND p_user_id != v_duel.opponent_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Fetch profiles
  SELECT json_build_object('id', id, 'username', username, 'display_name', display_name, 'elo', elo, 'level', level, 'avatar_url', avatar_url)
  INTO v_challenger FROM cc_profiles WHERE id = v_duel.challenger_id;

  SELECT json_build_object('id', id, 'username', username, 'display_name', display_name, 'elo', elo, 'level', level, 'avatar_url', avatar_url)
  INTO v_opponent FROM cc_profiles WHERE id = v_duel.opponent_id;

  RETURN json_build_object(
    'id', v_duel.id,
    'status', v_duel.status,
    'movies', v_duel.movies,
    'challenger', v_challenger,
    'opponent', v_opponent,
    -- Anti-spoiler: hide challenger score if opponent hasn't played yet
    'challenger_score', CASE WHEN v_duel.status != 'waiting' OR p_user_id = v_duel.challenger_id THEN v_duel.challenger_score ELSE NULL END,
    'challenger_results', CASE WHEN v_duel.status != 'waiting' OR p_user_id = v_duel.challenger_id THEN v_duel.challenger_results ELSE NULL END,
    'opponent_score', v_duel.opponent_score,
    'opponent_results', v_duel.opponent_results,
    'winner_id', v_duel.winner_id,
    'created_at', v_duel.created_at,
    'expires_at', v_duel.expires_at,
    'completed_at', v_duel.completed_at
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_get_duel(UUID, UUID) TO authenticated;

-- =============================================================================
-- RPC 4: cc_submit_duel_round(p_duel_id, p_user_id, p_score, p_results)
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_submit_duel_round(
  p_duel_id UUID,
  p_user_id UUID,
  p_score INT,
  p_results JSONB
)
RETURNS JSON AS $$
DECLARE
  v_duel RECORD;
  v_winner_id UUID;
  v_game_result JSON;
  v_max_possible INT;
BEGIN
  SELECT * INTO v_duel FROM cc_duels WHERE id = p_duel_id FOR UPDATE;
  IF v_duel IS NULL THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;
  IF p_user_id != v_duel.opponent_id THEN
    RAISE EXCEPTION 'Not the opponent';
  END IF;
  IF v_duel.status != 'waiting' THEN
    RAISE EXCEPTION 'Duel already completed or expired';
  END IF;
  IF v_duel.expires_at < NOW() THEN
    UPDATE cc_duels SET status = 'expired' WHERE id = p_duel_id;
    RAISE EXCEPTION 'Duel has expired';
  END IF;

  -- Determine winner
  IF p_score > v_duel.challenger_score THEN
    v_winner_id := p_user_id;
  ELSIF p_score < v_duel.challenger_score THEN
    v_winner_id := v_duel.challenger_id;
  ELSE
    v_winner_id := NULL; -- draw
  END IF;

  -- Update duel
  UPDATE cc_duels SET
    opponent_score = p_score,
    opponent_results = p_results,
    winner_id = v_winner_id,
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_duel_id;

  -- Record game for opponent progression
  v_max_possible := jsonb_array_length(p_results) * 5;
  SELECT cc_complete_game(
    p_user_id,
    'duel',
    p_score,
    v_max_possible,
    p_results
  ) INTO v_game_result;

  RETURN json_build_object(
    'winner_id', v_winner_id,
    'challenger_score', v_duel.challenger_score,
    'opponent_score', p_score,
    'game_result', v_game_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_submit_duel_round(UUID, UUID, INT, JSONB) TO authenticated;

-- =============================================================================
-- RPC 5: cc_get_my_duels(p_user_id)
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_get_my_duels(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  -- Auto-expire stale duels
  UPDATE cc_duels SET status = 'expired'
  WHERE status = 'waiting' AND expires_at < NOW();

  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY sort_order, created_at DESC), '[]'::json) FROM (
      SELECT json_build_object(
        'id', d.id,
        'status', d.status,
        'challenger', json_build_object('id', cp.id, 'username', cp.username, 'display_name', cp.display_name, 'elo', cp.elo, 'avatar_url', cp.avatar_url),
        'opponent', json_build_object('id', op.id, 'username', op.username, 'display_name', op.display_name, 'elo', op.elo, 'avatar_url', op.avatar_url),
        'challenger_score', d.challenger_score,
        'opponent_score', d.opponent_score,
        'winner_id', d.winner_id,
        'created_at', d.created_at,
        'expires_at', d.expires_at,
        'completed_at', d.completed_at,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_get_my_duels(UUID) TO authenticated;

-- =============================================================================
-- RPC 6: cc_count_pending_duels(p_user_id)
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_count_pending_duels(p_user_id UUID)
RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INT
    FROM cc_duels
    WHERE opponent_id = p_user_id
      AND status = 'waiting'
      AND expires_at > NOW()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_count_pending_duels(UUID) TO authenticated;
