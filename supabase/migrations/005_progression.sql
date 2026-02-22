-- CineClue Migration 005: ELO, XP, Streaks, Level

-- Calculate ELO delta
CREATE OR REPLACE FUNCTION cc_calculate_elo(
  p_current_elo INT,
  p_games_played INT,
  p_score INT,
  p_max_score INT,
  p_movie_diffs TEXT[]
)
RETURNS TABLE(new_elo INT, delta INT) AS $$
DECLARE
  v_k INT;
  v_performance NUMERIC;
  v_expected NUMERIC := 0.60;
  v_hard_count INT;
  v_easy_count INT;
  v_diff_mult NUMERIC;
  v_delta INT;
BEGIN
  v_k := CASE
    WHEN p_games_played < 10 THEN 40
    WHEN p_games_played < 30 THEN 20
    ELSE 10
  END;

  v_performance := p_score::numeric / GREATEST(p_max_score, 1);

  v_hard_count := (SELECT COUNT(*) FROM unnest(p_movie_diffs) d WHERE d = 'difícil');
  v_easy_count := (SELECT COUNT(*) FROM unnest(p_movie_diffs) d WHERE d = 'fácil');
  v_diff_mult := 1 + (v_hard_count * 0.15) - (v_easy_count * 0.05);

  v_delta := round(v_k * (v_performance - v_expected) * v_diff_mult);
  new_elo := GREATEST(100, p_current_elo + v_delta);
  delta := v_delta;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate XP earned from a game
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

-- Level from XP: 100 * N^1.5
CREATE OR REPLACE FUNCTION cc_level_from_xp(p_xp INT)
RETURNS INT AS $$
DECLARE
  v_level INT := 1;
BEGIN
  WHILE floor(100 * power(v_level + 1, 1.5)) <= p_xp LOOP
    v_level := v_level + 1;
  END LOOP;
  RETURN v_level;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update streak (only for daily mode)
CREATE OR REPLACE FUNCTION cc_update_streak(p_user_id UUID)
RETURNS TABLE(new_streak INT, streak_bonus_xp INT) AS $$
DECLARE
  v_last_played DATE;
  v_current INT;
  v_best INT;
  v_today DATE := CURRENT_DATE;
  v_bonus INT := 0;
BEGIN
  SELECT streak_last_played, streak_current, streak_best
  INTO v_last_played, v_current, v_best
  FROM cc_profiles WHERE id = p_user_id;

  -- Already played today
  IF v_last_played = v_today THEN
    new_streak := v_current;
    streak_bonus_xp := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_last_played = v_today - 1 THEN
    -- Continue streak
    v_current := v_current + 1;
  ELSIF v_last_played = v_today - 2 AND v_current >= 7 THEN
    -- Shield: streak >= 7 gets 1 day grace
    v_current := v_current + 1;
  ELSE
    -- Reset streak
    v_current := 1;
  END IF;

  v_best := GREATEST(v_best, v_current);

  -- Streak milestones bonus XP
  CASE v_current
    WHEN 3 THEN v_bonus := 50;
    WHEN 7 THEN v_bonus := 150;
    WHEN 14 THEN v_bonus := 300;
    WHEN 30 THEN v_bonus := 500;
    WHEN 100 THEN v_bonus := 2000;
    ELSE v_bonus := 0;
  END CASE;

  UPDATE cc_profiles SET
    streak_current = v_current,
    streak_best = v_best,
    streak_last_played = v_today
  WHERE id = p_user_id;

  new_streak := v_current;
  streak_bonus_xp := v_bonus;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Rewrite cc_complete_game with full progression
CREATE OR REPLACE FUNCTION cc_complete_game(
  p_user_id UUID,
  p_mode TEXT,
  p_total_score INT,
  p_max_possible INT,
  p_movies_played JSONB
)
RETURNS JSON AS $$
DECLARE
  v_game_id UUID;
  v_profile cc_profiles%ROWTYPE;
  v_diffs TEXT[];
  v_elo_result RECORD;
  v_xp_earned INT;
  v_streak_result RECORD;
  v_new_xp INT;
  v_new_level INT;
BEGIN
  -- Get current profile
  SELECT * INTO v_profile FROM cc_profiles WHERE id = p_user_id;

  -- Extract difficulty array from movies_played
  SELECT array_agg(m.diff) INTO v_diffs
  FROM jsonb_array_elements(p_movies_played) elem
  JOIN cc_movies m ON m.id = (elem->>'movie_id')::int;

  -- Calculate ELO
  SELECT * INTO v_elo_result FROM cc_calculate_elo(
    v_profile.elo, v_profile.games_played, p_total_score, p_max_possible, v_diffs
  );

  -- Calculate XP
  v_xp_earned := cc_calculate_xp(p_mode, p_movies_played);

  -- Update streak (daily only)
  IF p_mode = 'daily' THEN
    SELECT * INTO v_streak_result FROM cc_update_streak(p_user_id);
    v_xp_earned := v_xp_earned + COALESCE(v_streak_result.streak_bonus_xp, 0);
  END IF;

  -- Calculate new level
  v_new_xp := v_profile.xp + v_xp_earned;
  v_new_level := cc_level_from_xp(v_new_xp);

  -- Insert game record
  INSERT INTO cc_games (user_id, mode, completed, total_score, max_possible, movies_played, elo_before, elo_after, elo_delta)
  VALUES (p_user_id, p_mode, true, p_total_score, p_max_possible, p_movies_played, v_profile.elo, v_elo_result.new_elo, v_elo_result.delta)
  RETURNING id INTO v_game_id;

  -- Update profile
  UPDATE cc_profiles SET
    games_played = games_played + 1,
    games_completed = games_completed + 1,
    total_score = total_score + p_total_score,
    elo = v_elo_result.new_elo,
    xp = v_new_xp,
    level = v_new_level
  WHERE id = p_user_id;

  RETURN json_build_object(
    'game_id', v_game_id,
    'total_score', p_total_score,
    'elo_before', v_profile.elo,
    'elo_after', v_elo_result.new_elo,
    'elo_delta', v_elo_result.delta,
    'xp_earned', v_xp_earned,
    'new_xp', v_new_xp,
    'new_level', v_new_level,
    'streak', CASE WHEN p_mode = 'daily' THEN v_streak_result.new_streak ELSE v_profile.streak_current END,
    'streak_bonus_xp', CASE WHEN p_mode = 'daily' THEN v_streak_result.streak_bonus_xp ELSE 0 END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
