-- Migration 017: Party Mode (local multiplayer)
-- Tables: cc_party_rooms, cc_party_players, cc_party_answers
-- 7 RPCs + 1 helper + RLS + indexes + cron cleanup

CREATE EXTENSION IF NOT EXISTS unaccent;

-- =============================================================================
-- TABLE: cc_party_rooms
-- =============================================================================
CREATE TABLE cc_party_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code CHAR(4) NOT NULL UNIQUE,
  host_user_id UUID REFERENCES cc_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','finished','expired')),
  num_rounds INT NOT NULL DEFAULT 5 CHECK (num_rounds IN (5, 10, 15)),
  current_round INT NOT NULL DEFAULT 0,
  current_clue INT NOT NULL DEFAULT 0,
  movies JSONB, -- frozen movie objects once game starts
  clue_started_at TIMESTAMPTZ, -- when current clue was revealed (for speed bonus)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '2 hours'
);

CREATE INDEX idx_cc_party_rooms_code ON cc_party_rooms(code);
CREATE INDEX idx_cc_party_rooms_status ON cc_party_rooms(status);

-- =============================================================================
-- TABLE: cc_party_players
-- =============================================================================
CREATE TABLE cc_party_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES cc_party_rooms(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🎬',
  total_score INT NOT NULL DEFAULT 0,
  connected BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cc_party_players_room ON cc_party_players(room_id);

-- =============================================================================
-- TABLE: cc_party_answers (no unique on room+player+round — allows retries)
-- =============================================================================
CREATE TABLE cc_party_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES cc_party_rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES cc_party_players(id) ON DELETE CASCADE,
  round_num INT NOT NULL,
  clue_index INT NOT NULL,
  answer TEXT NOT NULL,
  correct BOOLEAN NOT NULL DEFAULT FALSE,
  points_earned INT NOT NULL DEFAULT 0,
  response_time_ms INT, -- ms since clue was revealed
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cc_party_answers_room_round ON cc_party_answers(room_id, round_num);
CREATE INDEX idx_cc_party_answers_player ON cc_party_answers(player_id);

-- =============================================================================
-- RLS: SELECT public on rooms/players. Mutations only via SECURITY DEFINER RPCs.
-- =============================================================================
ALTER TABLE cc_party_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_party_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_party_answers ENABLE ROW LEVEL SECURITY;

-- Anyone can read rooms and players (needed for joining/viewing)
CREATE POLICY "cc_party_rooms_select" ON cc_party_rooms FOR SELECT USING (true);
CREATE POLICY "cc_party_players_select" ON cc_party_players FOR SELECT USING (true);
CREATE POLICY "cc_party_answers_select" ON cc_party_answers FOR SELECT USING (true);

-- No direct INSERT/UPDATE/DELETE — all via RPCs

-- =============================================================================
-- HELPER: cc_party_check_answer(input, title, alts)
-- Normalize in PL/pgSQL: lower + unaccent + strip non-alnum + bidirectional match
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_normalize(raw TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN regexp_replace(
    lower(unaccent(COALESCE(raw, ''))),
    '[^a-z0-9 ]', '', 'g'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION cc_party_strip_article(str TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN regexp_replace(str, '^(el|la|los|las|the|a|an|le|les|lo|il|un|una|unos|unas)\s+', '', 'i');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION cc_party_check_answer(p_input TEXT, p_title TEXT, p_alts TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
  v_inp TEXT;
  v_inp_stripped TEXT;
  v_target TEXT;
  v_target_stripped TEXT;
  v_alt TEXT;
BEGIN
  v_inp := cc_party_normalize(p_input);
  IF length(v_inp) < 3 THEN RETURN FALSE; END IF;
  v_inp_stripped := cc_party_strip_article(v_inp);

  -- Check main title
  v_target := cc_party_normalize(p_title);
  v_target_stripped := cc_party_strip_article(v_target);

  IF length(v_target) >= 3 AND (v_inp LIKE '%' || v_target || '%' OR v_target LIKE '%' || v_inp || '%') THEN RETURN TRUE; END IF;
  IF length(v_target_stripped) >= 3 AND (v_inp_stripped LIKE '%' || v_target_stripped || '%' OR v_target_stripped LIKE '%' || v_inp_stripped || '%') THEN RETURN TRUE; END IF;

  -- Check alts
  IF p_alts IS NOT NULL THEN
    FOREACH v_alt IN ARRAY p_alts LOOP
      v_target := cc_party_normalize(v_alt);
      v_target_stripped := cc_party_strip_article(v_target);
      IF length(v_target) >= 3 AND (v_inp LIKE '%' || v_target || '%' OR v_target LIKE '%' || v_inp || '%') THEN RETURN TRUE; END IF;
      IF length(v_target_stripped) >= 3 AND (v_inp_stripped LIKE '%' || v_target_stripped || '%' OR v_target_stripped LIKE '%' || v_inp_stripped || '%') THEN RETURN TRUE; END IF;
    END LOOP;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- RPC 1: cc_party_create_room(p_host_user_id, p_num_rounds)
-- Creates a room with a unique 4-letter code
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_create_room(p_host_user_id UUID DEFAULT NULL, p_num_rounds INT DEFAULT 5)
RETURNS JSON AS $$
DECLARE
  v_code CHAR(4);
  v_room_id UUID;
  v_attempts INT := 0;
BEGIN
  IF p_num_rounds NOT IN (5, 10, 15) THEN
    RAISE EXCEPTION 'num_rounds must be 5, 10, or 15';
  END IF;

  -- Generate unique 4-letter code
  LOOP
    v_code := upper(substr(md5(random()::text), 1, 4));
    -- Avoid ambiguous chars
    v_code := replace(replace(replace(v_code, 'O', 'X'), 'I', 'Y'), '0', 'Z');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM cc_party_rooms WHERE code = v_code AND status IN ('waiting', 'playing'));
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN RAISE EXCEPTION 'Could not generate unique code'; END IF;
  END LOOP;

  INSERT INTO cc_party_rooms (code, host_user_id, num_rounds)
  VALUES (v_code, p_host_user_id, p_num_rounds)
  RETURNING id INTO v_room_id;

  RETURN json_build_object(
    'room_id', v_room_id,
    'code', v_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_create_room(UUID, INT) TO anon, authenticated;

-- =============================================================================
-- RPC 2: cc_party_join_room(p_code, p_display_name, p_avatar)
-- Joins a player to a waiting room
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_join_room(p_code TEXT, p_display_name TEXT, p_avatar TEXT DEFAULT '🎬')
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
  v_player_id UUID;
  v_player_count INT;
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE code = upper(p_code) AND status = 'waiting';
  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Room not found or already started';
  END IF;

  -- Max 20 players
  SELECT COUNT(*) INTO v_player_count FROM cc_party_players WHERE room_id = v_room.id;
  IF v_player_count >= 20 THEN
    RAISE EXCEPTION 'Room is full (max 20 players)';
  END IF;

  INSERT INTO cc_party_players (room_id, display_name, avatar)
  VALUES (v_room.id, p_display_name, p_avatar)
  RETURNING id INTO v_player_id;

  RETURN json_build_object(
    'player_id', v_player_id,
    'room_id', v_room.id,
    'code', v_room.code,
    'num_rounds', v_room.num_rounds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_join_room(TEXT, TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- RPC 3: cc_party_start_game(p_room_id)
-- Host starts the game: selects movies, sets status to playing
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_start_game(p_room_id UUID)
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
  v_movies JSONB;
  v_player_count INT;
  v_num_rounds INT;
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'waiting' THEN RAISE EXCEPTION 'Game already started'; END IF;

  SELECT COUNT(*) INTO v_player_count FROM cc_party_players WHERE room_id = p_room_id;
  IF v_player_count < 2 THEN RAISE EXCEPTION 'Need at least 2 players'; END IF;

  v_num_rounds := v_room.num_rounds;

  -- Select random movies for party (mix of difficulties)
  SELECT jsonb_agg(movie_data) INTO v_movies FROM (
    (SELECT jsonb_build_object(
      'id', m.id, 'title', m.title, 'alt', m.alt, 'clues', m.clues, 'diff', m.diff
    ) AS movie_data FROM cc_movies m WHERE m.active ORDER BY random() LIMIT v_num_rounds)
  ) sub;

  IF v_movies IS NULL OR jsonb_array_length(v_movies) < v_num_rounds THEN
    -- Fallback: get whatever we can
    SELECT jsonb_agg(movie_data) INTO v_movies FROM (
      SELECT jsonb_build_object(
        'id', m.id, 'title', m.title, 'alt', m.alt, 'clues', m.clues, 'diff', m.diff
      ) AS movie_data FROM cc_movies m WHERE m.active ORDER BY random() LIMIT v_num_rounds
    ) sub;
  END IF;

  UPDATE cc_party_rooms SET
    status = 'playing',
    movies = v_movies,
    current_round = 0,
    current_clue = 0,
    clue_started_at = NOW()
  WHERE id = p_room_id;

  RETURN json_build_object(
    'status', 'playing',
    'movies', v_movies,
    'current_round', 0,
    'current_clue', 0,
    'player_count', v_player_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_start_game(UUID) TO anon, authenticated;

-- =============================================================================
-- RPC 4: cc_party_advance_clue(p_room_id)
-- Advances to next clue within current round (host calls on timer expiry)
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_advance_clue(p_room_id UUID)
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'playing' THEN RAISE EXCEPTION 'Game not in progress'; END IF;

  IF v_room.current_clue < 4 THEN
    UPDATE cc_party_rooms SET
      current_clue = current_clue + 1,
      clue_started_at = NOW()
    WHERE id = p_room_id;

    RETURN json_build_object(
      'current_round', v_room.current_round,
      'current_clue', v_room.current_clue + 1,
      'action', 'clue_advanced'
    );
  ELSE
    -- All clues exhausted for this round — signal round end
    RETURN json_build_object(
      'current_round', v_room.current_round,
      'current_clue', v_room.current_clue,
      'action', 'round_exhausted'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_advance_clue(UUID) TO anon, authenticated;

-- =============================================================================
-- RPC 5: cc_party_submit_answer(p_room_id, p_player_id, p_answer, p_response_time_ms)
-- Player submits an answer. RPC validates if already answered correctly this round.
-- Scoring: base[500,400,300,200,100] + round(500 * max(0, 1 - responseTimeMs/clueWindowMs))
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_submit_answer(
  p_room_id UUID,
  p_player_id UUID,
  p_answer TEXT,
  p_response_time_ms INT DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
  v_movie JSONB;
  v_title TEXT;
  v_alts TEXT[];
  v_is_correct BOOLEAN;
  v_already_correct BOOLEAN;
  v_points INT := 0;
  v_base_points INT[] := ARRAY[500, 400, 300, 200, 100];
  v_clue_timers INT[] := ARRAY[30000, 25000, 20000, 15000, 10000]; -- ms
  v_speed_bonus INT;
  v_clue_window INT;
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'playing' THEN RAISE EXCEPTION 'Game not in progress'; END IF;

  -- Check player belongs to room
  IF NOT EXISTS (SELECT 1 FROM cc_party_players WHERE id = p_player_id AND room_id = p_room_id) THEN
    RAISE EXCEPTION 'Player not in this room';
  END IF;

  -- Check if already answered correctly this round
  SELECT EXISTS (
    SELECT 1 FROM cc_party_answers
    WHERE room_id = p_room_id AND player_id = p_player_id
      AND round_num = v_room.current_round AND correct = TRUE
  ) INTO v_already_correct;

  IF v_already_correct THEN
    RETURN json_build_object('correct', FALSE, 'already_answered', TRUE, 'points', 0);
  END IF;

  -- Get current movie
  v_movie := v_room.movies->v_room.current_round;
  v_title := v_movie->>'title';

  -- Extract alts array
  SELECT array_agg(elem::TEXT) INTO v_alts
  FROM jsonb_array_elements_text(COALESCE(v_movie->'alt', '[]'::jsonb)) AS elem;

  -- Check answer
  v_is_correct := cc_party_check_answer(p_answer, v_title, v_alts);

  IF v_is_correct THEN
    -- Calculate points: base + speed bonus
    v_points := v_base_points[v_room.current_clue + 1];
    v_clue_window := v_clue_timers[v_room.current_clue + 1];
    v_speed_bonus := round(500.0 * GREATEST(0.0, 1.0 - p_response_time_ms::NUMERIC / v_clue_window));
    v_points := v_points + v_speed_bonus;

    -- Update player total score
    UPDATE cc_party_players SET total_score = total_score + v_points WHERE id = p_player_id;
  END IF;

  -- Record answer (allows retries — no unique constraint)
  INSERT INTO cc_party_answers (room_id, player_id, round_num, clue_index, answer, correct, points_earned, response_time_ms)
  VALUES (p_room_id, p_player_id, v_room.current_round, v_room.current_clue, p_answer, v_is_correct, v_points, p_response_time_ms);

  RETURN json_build_object(
    'correct', v_is_correct,
    'already_answered', FALSE,
    'points', v_points,
    'clue_index', v_room.current_clue
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_submit_answer(UUID, UUID, TEXT, INT) TO anon, authenticated;

-- =============================================================================
-- RPC 6: cc_party_next_round(p_room_id)
-- Advances to next round or finishes game
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_next_round(p_room_id UUID)
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
  v_total_rounds INT;
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'playing' THEN RAISE EXCEPTION 'Game not in progress'; END IF;

  v_total_rounds := jsonb_array_length(v_room.movies);

  IF v_room.current_round + 1 >= v_total_rounds THEN
    -- Game finished
    UPDATE cc_party_rooms SET
      status = 'finished',
      finished_at = NOW()
    WHERE id = p_room_id;

    RETURN json_build_object(
      'action', 'game_finished',
      'current_round', v_room.current_round
    );
  ELSE
    -- Next round
    UPDATE cc_party_rooms SET
      current_round = current_round + 1,
      current_clue = 0,
      clue_started_at = NOW()
    WHERE id = p_room_id;

    RETURN json_build_object(
      'action', 'next_round',
      'current_round', v_room.current_round + 1,
      'current_clue', 0
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_next_round(UUID) TO anon, authenticated;

-- =============================================================================
-- RPC 7: cc_party_get_rankings(p_room_id)
-- Returns ranked player list for a room
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_get_rankings(p_room_id UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY total_score DESC), '[]'::json) FROM (
      SELECT json_build_object(
        'player_id', p.id,
        'display_name', p.display_name,
        'avatar', p.avatar,
        'total_score', p.total_score,
        'connected', p.connected
      ) AS row_data,
      p.total_score
      FROM cc_party_players p
      WHERE p.room_id = p_room_id
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_get_rankings(UUID) TO anon, authenticated;

-- =============================================================================
-- CRON: Cleanup expired rooms (run hourly via pg_cron if available)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-party-rooms',
      '0 * * * *',
      $$UPDATE cc_party_rooms SET status = 'expired' WHERE status IN ('waiting', 'playing') AND expires_at < NOW()$$
    );
  END IF;
END $$;
