-- =============================================================================
-- Migration 022: Party — Player Skip Clue + Score by actual clue index
-- =============================================================================
-- Adds p_clue_index param so players who skip ahead locally get scored
-- based on the clue they were actually on, not the server's current_clue.

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
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.status != 'playing' THEN RAISE EXCEPTION 'Game not in progress'; END IF;

  -- Check player belongs to room
  IF NOT EXISTS (SELECT 1 FROM cc_party_players WHERE id = p_player_id AND room_id = p_room_id) THEN
    RAISE EXCEPTION 'Player not in this room';
  END IF;

  -- Rate limit: max 10 attempts per round per player
  IF (SELECT COUNT(*) FROM cc_party_answers
      WHERE room_id = p_room_id AND player_id = p_player_id
        AND round_num = v_room.current_round) >= 10 THEN
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

  -- Get current movie
  v_movie := v_room.movies->v_room.current_round;
  v_title := v_movie->>'title';

  -- Extract alts array
  SELECT array_agg(elem::TEXT) INTO v_alts
  FROM jsonb_array_elements_text(COALESCE(v_movie->'alt', '[]'::jsonb)) AS elem;

  -- Check answer
  v_is_correct := cc_party_check_answer(p_answer, v_title, v_alts);

  IF v_is_correct THEN
    -- Calculate points: base by effective clue + speed bonus
    v_points := v_base_points[v_effective_clue + 1];
    v_clue_window := v_clue_timers[v_effective_clue + 1];
    v_speed_bonus := round(500.0 * GREATEST(0.0, 1.0 - p_response_time_ms::NUMERIC / v_clue_window));
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

  -- Record answer (store effective clue index)
  INSERT INTO cc_party_answers (room_id, player_id, round_num, clue_index, answer, correct, points_earned, response_time_ms)
  VALUES (p_room_id, p_player_id, v_room.current_round, v_effective_clue, p_answer, v_is_correct, v_points, p_response_time_ms);

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

-- Need to drop old 4-arg grant and add new 5-arg grant
GRANT EXECUTE ON FUNCTION cc_party_submit_answer(UUID, UUID, TEXT, INT, INT) TO anon, authenticated;
