-- CineClue Migration 004: Daily movie scheduling + functions

-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily movie: picks movie not used in last 108 days, cycling difficulty
CREATE OR REPLACE FUNCTION cc_schedule_daily_movie()
RETURNS void AS $$
DECLARE
  v_date DATE := CURRENT_DATE + 1; -- schedule for tomorrow
  v_day_num INT;
  v_target_diff TEXT;
  v_movie_id INT;
BEGIN
  -- Check if already scheduled
  IF EXISTS (SELECT 1 FROM cc_daily_movies WHERE date = v_date) THEN
    RETURN;
  END IF;

  -- Cycle difficulty: day 0=easy, 1=medium, 2=hard
  v_day_num := EXTRACT(DOY FROM v_date)::INT % 3;
  v_target_diff := CASE v_day_num
    WHEN 0 THEN 'fácil'
    WHEN 1 THEN 'medio'
    ELSE 'difícil'
  END;

  -- Pick a movie not used in last 108 days
  SELECT m.id INTO v_movie_id
  FROM cc_movies m
  WHERE m.active = true
    AND m.diff = v_target_diff
    AND m.id NOT IN (
      SELECT dm.movie_id FROM cc_daily_movies dm
      WHERE dm.date > CURRENT_DATE - 108
    )
  ORDER BY random()
  LIMIT 1;

  -- Fallback: if no movie matches, pick any active movie of that difficulty
  IF v_movie_id IS NULL THEN
    SELECT m.id INTO v_movie_id
    FROM cc_movies m
    WHERE m.active = true AND m.diff = v_target_diff
    ORDER BY random()
    LIMIT 1;
  END IF;

  -- Fallback: any active movie
  IF v_movie_id IS NULL THEN
    SELECT m.id INTO v_movie_id
    FROM cc_movies m
    WHERE m.active = true
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF v_movie_id IS NOT NULL THEN
    INSERT INTO cc_daily_movies (movie_id, date) VALUES (v_movie_id, v_date);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Get today's daily movie + check if user already played
CREATE OR REPLACE FUNCTION cc_get_today_daily(p_user_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  v_daily cc_daily_movies%ROWTYPE;
  v_movie cc_movies%ROWTYPE;
  v_already_played BOOLEAN := false;
  v_user_game cc_games%ROWTYPE;
BEGIN
  SELECT * INTO v_daily FROM cc_daily_movies WHERE date = CURRENT_DATE;
  IF NOT FOUND THEN
    RETURN json_build_object('available', false);
  END IF;

  SELECT * INTO v_movie FROM cc_movies WHERE id = v_daily.movie_id;

  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_user_game FROM cc_games
    WHERE user_id = p_user_id AND mode = 'daily'
      AND played_at::date = CURRENT_DATE
    LIMIT 1;
    v_already_played := FOUND;
  END IF;

  RETURN json_build_object(
    'available', true,
    'movie', row_to_json(v_movie),
    'already_played', v_already_played,
    'user_game', CASE WHEN v_already_played THEN row_to_json(v_user_game) ELSE NULL END
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get daily stats: distribution of guesses per clue
CREATE OR REPLACE FUNCTION cc_get_daily_stats()
RETURNS JSON AS $$
DECLARE
  v_total INT;
  v_guessed INT;
  v_distribution JSON;
BEGIN
  SELECT COUNT(*) INTO v_total FROM cc_games
  WHERE mode = 'daily' AND played_at::date = CURRENT_DATE AND completed = true;

  SELECT COUNT(*) INTO v_guessed FROM cc_games
  WHERE mode = 'daily' AND played_at::date = CURRENT_DATE AND completed = true AND total_score > 0;

  SELECT json_agg(json_build_object('clue', clue, 'count', cnt))
  INTO v_distribution
  FROM (
    SELECT
      (elem->>'clue_revealed')::int AS clue,
      COUNT(*) AS cnt
    FROM cc_games g,
      jsonb_array_elements(g.movies_played) AS elem
    WHERE g.mode = 'daily'
      AND g.played_at::date = CURRENT_DATE
      AND g.completed = true
      AND (elem->>'guessed')::boolean = true
    GROUP BY (elem->>'clue_revealed')::int
    ORDER BY clue
  ) sub;

  RETURN json_build_object(
    'total_players', v_total,
    'guessed_count', v_guessed,
    'guess_rate', CASE WHEN v_total > 0 THEN round((v_guessed::numeric / v_total) * 100) ELSE 0 END,
    'distribution', COALESCE(v_distribution, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Schedule cron: every day at 03:00 UTC (00:00 ART)
SELECT cron.schedule('cc-daily-movie', '0 3 * * *', $$SELECT cc_schedule_daily_movie()$$);

-- Also schedule today's movie immediately if not exists
SELECT cc_schedule_daily_movie();

-- Grant permissions
GRANT EXECUTE ON FUNCTION cc_get_today_daily(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cc_get_daily_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cc_schedule_daily_movie() TO authenticated;
