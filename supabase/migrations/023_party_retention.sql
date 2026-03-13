-- =============================================================================
-- Migration 023: Party Retention — Categories, Progression, Logic Fixes
-- =============================================================================

-- A1: Add category column to rooms
ALTER TABLE cc_party_rooms ADD COLUMN IF NOT EXISTS category TEXT;

-- A2: Add 'party' to cc_games mode CHECK constraint
ALTER TABLE cc_games DROP CONSTRAINT IF EXISTS cc_games_mode_check;
ALTER TABLE cc_games ADD CONSTRAINT cc_games_mode_check CHECK (mode IN ('solo','daily','duel_local','duel','party'));

-- =============================================================================
-- A3: Recreate cc_party_create_room with p_category param
-- =============================================================================
DROP FUNCTION IF EXISTS cc_party_create_room(UUID, INT, BOOLEAN, INT);

CREATE OR REPLACE FUNCTION cc_party_create_room(
  p_host_user_id UUID DEFAULT NULL,
  p_num_rounds INT DEFAULT 5,
  p_auto_advance BOOLEAN DEFAULT FALSE,
  p_max_players INT DEFAULT 20,
  p_category TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_code CHAR(4);
  v_room_id UUID;
  v_attempts INT := 0;
BEGIN
  IF p_num_rounds NOT IN (5, 10, 15) THEN
    RAISE EXCEPTION 'num_rounds must be 5, 10, or 15';
  END IF;

  IF p_max_players < 2 OR p_max_players > 50 THEN
    RAISE EXCEPTION 'max_players must be between 2 and 50';
  END IF;

  LOOP
    v_code := upper(substr(md5(random()::text), 1, 4));
    v_code := replace(replace(replace(v_code, 'O', 'X'), 'I', 'Y'), '0', 'Z');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM cc_party_rooms WHERE code = v_code AND status IN ('waiting', 'playing'));
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN RAISE EXCEPTION 'Could not generate unique code'; END IF;
  END LOOP;

  INSERT INTO cc_party_rooms (code, host_user_id, num_rounds, auto_advance, max_players, category)
  VALUES (v_code, p_host_user_id, p_num_rounds, p_auto_advance, p_max_players, p_category)
  RETURNING id INTO v_room_id;

  RETURN json_build_object(
    'room_id', v_room_id,
    'code', v_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_create_room(UUID, INT, BOOLEAN, INT, TEXT) TO anon, authenticated;

-- =============================================================================
-- A4: Recreate cc_party_start_game — filter by category if set
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_start_game(p_room_id UUID)
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
  v_movies JSONB;
  v_player_count INT;
  v_num_rounds INT;
  v_category TEXT;
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'waiting' THEN RAISE EXCEPTION 'Game already started'; END IF;

  SELECT COUNT(*) INTO v_player_count FROM cc_party_players WHERE room_id = p_room_id;
  IF v_player_count < 2 THEN RAISE EXCEPTION 'Need at least 2 players'; END IF;

  v_num_rounds := v_room.num_rounds;
  v_category := v_room.category;

  -- Select movies filtered by category if set
  IF v_category IS NOT NULL AND v_category != '' THEN
    IF v_category = 'Clásicos' THEN
      SELECT jsonb_agg(movie_data) INTO v_movies FROM (
        SELECT jsonb_build_object(
          'id', m.id, 'title', m.title, 'alt', m.alt, 'clues', m.clues, 'diff', m.diff
        ) AS movie_data FROM cc_movies m WHERE m.active AND m.decade < 2000 ORDER BY random() LIMIT v_num_rounds
      ) sub;
    ELSE
      SELECT jsonb_agg(movie_data) INTO v_movies FROM (
        SELECT jsonb_build_object(
          'id', m.id, 'title', m.title, 'alt', m.alt, 'clues', m.clues, 'diff', m.diff
        ) AS movie_data FROM cc_movies m WHERE m.active AND m.genres @> ARRAY[v_category] ORDER BY random() LIMIT v_num_rounds
      ) sub;
    END IF;
  END IF;

  -- Fallback: unfiltered if not enough movies from category
  IF v_movies IS NULL OR jsonb_array_length(v_movies) < v_num_rounds THEN
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
-- A5: Recreate cc_party_submit_answer — FOR UPDATE + server-side time validation + rate limit 5
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_submit_answer(
  p_room_id UUID,
  p_player_id UUID,
  p_answer TEXT,
  p_response_time_ms INT DEFAULT 0,
  p_clue_index INT DEFAULT NULL
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
  v_first_blood BOOLEAN := FALSE;
  v_multiplier INT := 1;
  v_num_rounds INT;
  v_effective_clue INT;
  v_server_elapsed INT;
  v_validated_time INT;
BEGIN
  -- FOR UPDATE to prevent race conditions
  SELECT * INTO v_room FROM cc_party_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'playing' THEN RAISE EXCEPTION 'Game not in progress'; END IF;

  -- Check player belongs to room
  IF NOT EXISTS (SELECT 1 FROM cc_party_players WHERE id = p_player_id AND room_id = p_room_id) THEN
    RAISE EXCEPTION 'Player not in this room';
  END IF;

  -- Rate limit: max 5 attempts per round per player
  IF (SELECT COUNT(*) FROM cc_party_answers
      WHERE room_id = p_room_id AND player_id = p_player_id
        AND round_num = v_room.current_round) >= 5 THEN
    RETURN json_build_object('correct', FALSE, 'rate_limited', TRUE, 'points', 0);
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

  -- Effective clue: use player's local clue if ahead of server, otherwise server's
  v_effective_clue := v_room.current_clue;
  IF p_clue_index IS NOT NULL AND p_clue_index > v_room.current_clue AND p_clue_index <= 4 THEN
    v_effective_clue := p_clue_index;
  END IF;

  -- Server-side response time validation
  v_server_elapsed := EXTRACT(EPOCH FROM (NOW() - v_room.clue_started_at))::INT * 1000;
  v_validated_time := GREATEST(p_response_time_ms, (v_server_elapsed * 0.8)::INT);

  -- Get current movie
  v_movie := v_room.movies->v_room.current_round;
  v_title := v_movie->>'title';

  -- Extract alts array
  SELECT array_agg(elem::TEXT) INTO v_alts
  FROM jsonb_array_elements_text(COALESCE(v_movie->'alt', '[]'::jsonb)) AS elem;

  -- Check answer
  v_is_correct := cc_party_check_answer(p_answer, v_title, v_alts);

  IF v_is_correct THEN
    -- Calculate points: base by effective clue + speed bonus (using validated time)
    v_points := v_base_points[v_effective_clue + 1];
    v_clue_window := v_clue_timers[v_effective_clue + 1];
    v_speed_bonus := round(500.0 * GREATEST(0.0, 1.0 - v_validated_time::NUMERIC / v_clue_window));
    v_points := v_points + v_speed_bonus;

    -- First Blood: +100 if no one else answered correctly this round yet
    IF NOT EXISTS (
      SELECT 1 FROM cc_party_answers
      WHERE room_id = p_room_id AND round_num = v_room.current_round AND correct = TRUE
    ) THEN
      v_first_blood := TRUE;
      v_points := v_points + 100;
    END IF;

    -- x2 Multiplier: last 2 rounds
    v_num_rounds := jsonb_array_length(v_room.movies);
    IF v_room.current_round >= v_num_rounds - 2 THEN
      v_multiplier := 2;
      v_points := v_points * 2;
    END IF;

    -- Update player total score
    UPDATE cc_party_players SET total_score = total_score + v_points WHERE id = p_player_id;
  END IF;

  -- Record answer (store effective clue index, validated time)
  INSERT INTO cc_party_answers (room_id, player_id, round_num, clue_index, answer, correct, points_earned, response_time_ms)
  VALUES (p_room_id, p_player_id, v_room.current_round, v_effective_clue, p_answer, v_is_correct, v_points, v_validated_time);

  RETURN json_build_object(
    'correct', v_is_correct,
    'already_answered', FALSE,
    'points', v_points,
    'clue_index', v_effective_clue,
    'first_blood', v_first_blood,
    'multiplier', v_multiplier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_submit_answer(UUID, UUID, TEXT, INT, INT) TO anon, authenticated;

-- =============================================================================
-- A6: Recreate cc_party_check_answer — min length 4, proportional check
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_check_answer(p_input TEXT, p_title TEXT, p_alts TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
  v_inp TEXT;
  v_inp_stripped TEXT;
  v_target TEXT;
  v_target_stripped TEXT;
  v_alt TEXT;
  v_len_inp INT;
  v_len_target INT;
BEGIN
  v_inp := cc_party_normalize(p_input);
  IF length(v_inp) < 4 THEN RETURN FALSE; END IF;
  v_inp_stripped := cc_party_strip_article(v_inp);

  -- Check main title
  v_target := cc_party_normalize(p_title);
  v_target_stripped := cc_party_strip_article(v_target);

  -- Proportional length check: shorter must be >= 40% of longer
  v_len_inp := length(v_inp);
  v_len_target := length(v_target);
  IF LEAST(v_len_inp, v_len_target) * 100 / GREATEST(v_len_inp, v_len_target) >= 40 THEN
    IF length(v_target) >= 4 AND (v_inp LIKE '%' || v_target || '%' OR v_target LIKE '%' || v_inp || '%') THEN RETURN TRUE; END IF;
    IF length(v_target_stripped) >= 4 AND (v_inp_stripped LIKE '%' || v_target_stripped || '%' OR v_target_stripped LIKE '%' || v_inp_stripped || '%') THEN RETURN TRUE; END IF;
  ELSE
    -- Below 40% ratio: require exact match (with article stripping)
    IF v_inp = v_target OR v_inp_stripped = v_target_stripped THEN RETURN TRUE; END IF;
  END IF;

  -- Check alts
  IF p_alts IS NOT NULL THEN
    FOREACH v_alt IN ARRAY p_alts LOOP
      v_target := cc_party_normalize(v_alt);
      v_target_stripped := cc_party_strip_article(v_target);
      v_len_target := length(v_target);
      IF LEAST(v_len_inp, v_len_target) * 100 / GREATEST(v_len_inp, v_len_target) >= 40 THEN
        IF length(v_target) >= 4 AND (v_inp LIKE '%' || v_target || '%' OR v_target LIKE '%' || v_inp || '%') THEN RETURN TRUE; END IF;
        IF length(v_target_stripped) >= 4 AND (v_inp_stripped LIKE '%' || v_target_stripped || '%' OR v_target_stripped LIKE '%' || v_inp_stripped || '%') THEN RETURN TRUE; END IF;
      ELSE
        IF v_inp = v_target OR v_inp_stripped = v_target_stripped THEN RETURN TRUE; END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- A7: Recreate cc_calculate_xp — add 'party' mode
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_calculate_xp(
  p_mode TEXT,
  p_movies_played JSONB
)
RETURNS INT AS $$
DECLARE
  v_xp INT := 0;
  v_elem JSONB;
BEGIN
  -- Base XP by mode
  v_xp := CASE p_mode
    WHEN 'daily' THEN 20
    WHEN 'solo' THEN 10
    WHEN 'party' THEN 10
    ELSE 5
  END;

  -- Bonus per movie
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_movies_played) LOOP
    IF (v_elem->>'guessed')::boolean THEN
      -- Bonus for early clue guesses
      CASE (v_elem->>'clue_revealed')::int
        WHEN 0 THEN v_xp := v_xp + 30; -- pista 1
        WHEN 1 THEN v_xp := v_xp + 20; -- pista 2
        ELSE NULL;
      END CASE;
    END IF;
  END LOOP;

  RETURN v_xp;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- A8: Recreate cc_party_join_room — return category in response
-- =============================================================================
DROP FUNCTION IF EXISTS cc_party_join_room(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION cc_party_join_room(p_code TEXT, p_display_name TEXT, p_avatar TEXT DEFAULT '🎬')
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
  v_player_id UUID;
  v_player_count INT;
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE code = upper(p_code);
  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.status != 'waiting' THEN
    RAISE EXCEPTION 'Game already started';
  END IF;

  SELECT COUNT(*) INTO v_player_count FROM cc_party_players WHERE room_id = v_room.id;
  IF v_player_count >= COALESCE(v_room.max_players, 20) THEN
    RAISE EXCEPTION 'Room is full';
  END IF;

  INSERT INTO cc_party_players (room_id, display_name, avatar)
  VALUES (v_room.id, p_display_name, p_avatar)
  RETURNING id INTO v_player_id;

  RETURN json_build_object(
    'player_id', v_player_id,
    'room_id', v_room.id,
    'code', v_room.code,
    'num_rounds', v_room.num_rounds,
    'auto_advance', v_room.auto_advance,
    'category', v_room.category
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_join_room(TEXT, TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- A9: cc_party_complete_for_player — records party game for progression
-- Builds movies_played JSONB from cc_party_answers, updates profile stats
-- =============================================================================
CREATE OR REPLACE FUNCTION cc_party_complete_for_player(
  p_room_id UUID,
  p_player_id UUID,
  p_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
  v_profile cc_profiles%ROWTYPE;
  v_movies_played JSONB;
  v_total_score INT;
  v_max_possible INT;
  v_num_rounds INT;
  v_game_id UUID;
  v_xp_earned INT;
  v_new_xp INT;
  v_new_level INT;
  v_diffs TEXT[];
  v_elo_result RECORD;
BEGIN
  -- Auth check
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_room FROM cc_party_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'finished' THEN RAISE EXCEPTION 'Game not finished'; END IF;

  -- Verify player belongs to room
  IF NOT EXISTS (SELECT 1 FROM cc_party_players WHERE id = p_player_id AND room_id = p_room_id) THEN
    RAISE EXCEPTION 'Player not in this room';
  END IF;

  -- Prevent duplicate recording
  IF EXISTS (SELECT 1 FROM cc_games WHERE user_id = p_user_id AND mode = 'party'
    AND movies_played @> jsonb_build_array(jsonb_build_object('party_room_id', p_room_id::text))) THEN
    RETURN json_build_object('already_recorded', TRUE);
  END IF;

  SELECT * INTO v_profile FROM cc_profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_num_rounds := jsonb_array_length(v_room.movies);

  -- Build movies_played from answers (one entry per round, best answer)
  SELECT jsonb_agg(round_data ORDER BY round_num) INTO v_movies_played FROM (
    SELECT
      a.round_num,
      jsonb_build_object(
        'movie_id', (v_room.movies->a.round_num->>'id')::int,
        'guessed', bool_or(a.correct),
        'clue_revealed', MIN(CASE WHEN a.correct THEN a.clue_index ELSE NULL END),
        'points_earned', CASE WHEN bool_or(a.correct) THEN 1 ELSE 0 END,
        'party_room_id', p_room_id::text
      ) AS round_data
    FROM cc_party_answers a
    WHERE a.room_id = p_room_id AND a.player_id = p_player_id
    GROUP BY a.round_num
  ) sub;

  -- Fill in rounds with no answers
  IF v_movies_played IS NULL THEN
    v_movies_played := '[]'::jsonb;
  END IF;

  -- Calculate totals for the game record
  v_total_score := (SELECT COUNT(*) FROM jsonb_array_elements(v_movies_played) elem WHERE (elem->>'guessed')::boolean)::int;
  v_max_possible := v_num_rounds;

  -- Get diffs for ELO calculation
  SELECT array_agg(m.diff) INTO v_diffs
  FROM jsonb_array_elements(v_movies_played) elem
  JOIN cc_movies m ON m.id = (elem->>'movie_id')::int;

  -- Calculate ELO (normalize to 0-1 scale for the ELO function)
  SELECT * INTO v_elo_result FROM cc_calculate_elo(
    v_profile.elo, v_profile.games_played, v_total_score, v_max_possible, v_diffs
  );

  -- Calculate XP
  v_xp_earned := cc_calculate_xp('party', v_movies_played);
  v_new_xp := v_profile.xp + v_xp_earned;
  v_new_level := cc_level_from_xp(v_new_xp);

  -- Insert game record
  INSERT INTO cc_games (user_id, mode, completed, total_score, max_possible, movies_played, elo_before, elo_after, elo_delta)
  VALUES (p_user_id, 'party', true, v_total_score, v_max_possible, v_movies_played, v_profile.elo, v_elo_result.new_elo, v_elo_result.delta)
  RETURNING id INTO v_game_id;

  -- Update profile
  UPDATE cc_profiles SET
    games_played = games_played + 1,
    games_completed = games_completed + 1,
    total_score = total_score + v_total_score,
    elo = v_elo_result.new_elo,
    xp = v_new_xp,
    level = v_new_level
  WHERE id = p_user_id;

  -- Update weekly ranking and category stats
  PERFORM cc_upsert_weekly_ranking(p_user_id, v_total_score);
  PERFORM cc_update_category_stats(p_user_id, v_movies_played);

  RETURN json_build_object(
    'game_id', v_game_id,
    'elo_before', v_profile.elo,
    'elo_after', v_elo_result.new_elo,
    'elo_delta', v_elo_result.delta,
    'xp_earned', v_xp_earned,
    'new_xp', v_new_xp,
    'new_level', v_new_level
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_complete_for_player(UUID, UUID, UUID) TO authenticated;

-- =============================================================================
-- A10: All GRANTs (already inline above, this is a safety net)
-- =============================================================================
GRANT EXECUTE ON FUNCTION cc_party_create_room(UUID, INT, BOOLEAN, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cc_party_start_game(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cc_party_submit_answer(UUID, UUID, TEXT, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cc_party_join_room(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cc_party_complete_for_player(UUID, UUID, UUID) TO authenticated;
