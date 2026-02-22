-- CineClue Migration 009: Admin Analytics Functions

-- Dashboard overview stats
CREATE OR REPLACE FUNCTION cc_admin_overview()
RETURNS JSON AS $$
DECLARE
  v_total_users INT;
  v_total_games INT;
  v_today_games INT;
  v_today_users INT;
  v_week_games INT;
  v_week_users INT;
  v_avg_score NUMERIC;
  v_avg_elo NUMERIC;
  v_daily_played_today INT;
  v_daily_total_today INT;
BEGIN
  SELECT COUNT(*) INTO v_total_users FROM cc_profiles;
  SELECT COUNT(*) INTO v_total_games FROM cc_games WHERE completed;

  SELECT COUNT(*) INTO v_today_games FROM cc_games WHERE completed AND played_at::date = CURRENT_DATE;
  SELECT COUNT(DISTINCT user_id) INTO v_today_users FROM cc_games WHERE completed AND played_at::date = CURRENT_DATE;

  SELECT COUNT(*) INTO v_week_games FROM cc_games WHERE completed AND played_at >= date_trunc('week', CURRENT_DATE);
  SELECT COUNT(DISTINCT user_id) INTO v_week_users FROM cc_games WHERE completed AND played_at >= date_trunc('week', CURRENT_DATE);

  SELECT COALESCE(round(AVG(total_score)::numeric, 1), 0) INTO v_avg_score FROM cc_games WHERE completed;
  SELECT COALESCE(round(AVG(elo)::numeric, 0), 1000) INTO v_avg_elo FROM cc_profiles WHERE games_played > 0;

  -- Daily participation rate
  SELECT COUNT(*) INTO v_daily_played_today FROM cc_games WHERE mode = 'daily' AND played_at::date = CURRENT_DATE AND completed;

  RETURN json_build_object(
    'total_users', v_total_users,
    'total_games', v_total_games,
    'today_games', v_today_games,
    'today_active_users', v_today_users,
    'week_games', v_week_games,
    'week_active_users', v_week_users,
    'avg_score', v_avg_score,
    'avg_elo', v_avg_elo,
    'daily_played_today', v_daily_played_today
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Games per day (last N days)
CREATE OR REPLACE FUNCTION cc_admin_games_per_day(p_days INT DEFAULT 30)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY row_data->>'date'), '[]'::json)
    FROM (
      SELECT json_build_object(
        'date', d::date,
        'total', COALESCE(g.cnt, 0),
        'solo', COALESCE(g.solo, 0),
        'daily', COALESCE(g.daily, 0),
        'duel', COALESCE(g.duel, 0),
        'unique_users', COALESCE(g.uu, 0)
      ) AS row_data
      FROM generate_series(CURRENT_DATE - (p_days - 1), CURRENT_DATE, '1 day') d
      LEFT JOIN (
        SELECT
          played_at::date AS day,
          COUNT(*) AS cnt,
          COUNT(*) FILTER (WHERE mode = 'solo') AS solo,
          COUNT(*) FILTER (WHERE mode = 'daily') AS daily,
          COUNT(*) FILTER (WHERE mode = 'duel_local') AS duel,
          COUNT(DISTINCT user_id) AS uu
        FROM cc_games WHERE completed
        GROUP BY played_at::date
      ) g ON g.day = d::date
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ELO distribution (buckets of 100)
CREATE OR REPLACE FUNCTION cc_admin_elo_distribution()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object('bucket', bucket, 'count', cnt) ORDER BY bucket), '[]'::json)
    FROM (
      SELECT floor(elo / 100) * 100 AS bucket, COUNT(*) AS cnt
      FROM cc_profiles WHERE games_played > 0
      GROUP BY bucket
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Movie hit rates (accuracy per movie)
CREATE OR REPLACE FUNCTION cc_admin_movie_stats()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY (row_data->>'hit_rate')::numeric DESC), '[]'::json)
    FROM (
      SELECT json_build_object(
        'movie_id', m.id,
        'title', m.title,
        'diff', m.diff,
        'times_played', COALESCE(s.played, 0),
        'times_guessed', COALESCE(s.guessed, 0),
        'hit_rate', CASE WHEN COALESCE(s.played, 0) > 0 THEN round((s.guessed::numeric / s.played) * 100, 1) ELSE 0 END,
        'avg_clue', COALESCE(s.avg_clue, 0),
        'active', m.active
      ) AS row_data
      FROM cc_movies m
      LEFT JOIN (
        SELECT
          (elem->>'movie_id')::int AS movie_id,
          COUNT(*) AS played,
          COUNT(*) FILTER (WHERE (elem->>'guessed')::boolean) AS guessed,
          round(AVG((elem->>'clue_revealed')::numeric) FILTER (WHERE (elem->>'guessed')::boolean), 1) AS avg_clue
        FROM cc_games g, jsonb_array_elements(g.movies_played) elem
        WHERE g.completed
        GROUP BY (elem->>'movie_id')::int
      ) s ON s.movie_id = m.id
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- User retention: how many users from day X also played day X+1
CREATE OR REPLACE FUNCTION cc_admin_retention(p_days INT DEFAULT 14)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY row_data->>'date'), '[]'::json)
    FROM (
      SELECT json_build_object(
        'date', d::date,
        'new_users', COALESCE(n.cnt, 0),
        'returning_users', COALESCE(r.cnt, 0),
        'total_active', COALESCE(a.cnt, 0)
      ) AS row_data
      FROM generate_series(CURRENT_DATE - (p_days - 1), CURRENT_DATE, '1 day') d
      LEFT JOIN (
        SELECT created_at::date AS day, COUNT(*) AS cnt
        FROM cc_profiles GROUP BY created_at::date
      ) n ON n.day = d::date
      LEFT JOIN (
        SELECT played_at::date AS day, COUNT(DISTINCT user_id) FILTER (
          WHERE user_id IN (SELECT DISTINCT user_id FROM cc_games WHERE played_at::date = cc_games.played_at::date - 1)
        ) AS cnt
        FROM cc_games WHERE completed
        GROUP BY played_at::date
      ) r ON r.day = d::date
      LEFT JOIN (
        SELECT played_at::date AS day, COUNT(DISTINCT user_id) AS cnt
        FROM cc_games WHERE completed GROUP BY played_at::date
      ) a ON a.day = d::date
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Mission completion rates
CREATE OR REPLACE FUNCTION cc_admin_mission_stats()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY (row_data->>'completion_rate')::numeric DESC), '[]'::json)
    FROM (
      SELECT json_build_object(
        'id', m.id,
        'slug', m.slug,
        'title', m.title,
        'type', m.type,
        'total_started', COALESCE(s.started, 0),
        'total_completed', COALESCE(s.completed, 0),
        'completion_rate', CASE WHEN COALESCE(s.started, 0) > 0 THEN round((s.completed::numeric / s.started) * 100, 1) ELSE 0 END
      ) AS row_data
      FROM cc_missions m
      LEFT JOIN (
        SELECT
          mission_id,
          COUNT(*) AS started,
          COUNT(*) FILTER (WHERE completed) AS completed
        FROM cc_mission_progress
        GROUP BY mission_id
      ) s ON s.mission_id = m.id
      WHERE m.active
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Recent games log
CREATE OR REPLACE FUNCTION cc_admin_recent_games(p_limit INT DEFAULT 50)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_data), '[]'::json)
    FROM (
      SELECT json_build_object(
        'game_id', g.id,
        'username', p.username,
        'display_name', p.display_name,
        'mode', g.mode,
        'total_score', g.total_score,
        'max_possible', g.max_possible,
        'elo_delta', g.elo_delta,
        'played_at', g.played_at
      ) AS row_data
      FROM cc_games g
      JOIN cc_profiles p ON p.id = g.user_id
      WHERE g.completed
      ORDER BY g.played_at DESC
      LIMIT p_limit
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- User list with stats
CREATE OR REPLACE FUNCTION cc_admin_users(p_limit INT DEFAULT 100, p_offset INT DEFAULT 0, p_sort TEXT DEFAULT 'created_at')
RETURNS JSON AS $$
DECLARE
  v_users JSON;
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM cc_profiles;

  SELECT json_agg(row_data) INTO v_users FROM (
    SELECT json_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'elo', p.elo,
      'xp', p.xp,
      'level', p.level,
      'games_played', p.games_played,
      'total_score', p.total_score,
      'streak_current', p.streak_current,
      'streak_best', p.streak_best,
      'created_at', p.created_at,
      'last_played', (SELECT MAX(played_at) FROM cc_games WHERE user_id = p.id)
    ) AS row_data
    FROM cc_profiles p
    ORDER BY
      CASE WHEN p_sort = 'elo' THEN p.elo END DESC NULLS LAST,
      CASE WHEN p_sort = 'games' THEN p.games_played END DESC NULLS LAST,
      CASE WHEN p_sort = 'xp' THEN p.xp END DESC NULLS LAST,
      CASE WHEN p_sort = 'created_at' THEN EXTRACT(EPOCH FROM p.created_at) END DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN json_build_object('total', v_total, 'users', COALESCE(v_users, '[]'::json));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Daily schedule management: view upcoming
CREATE OR REPLACE FUNCTION cc_admin_daily_schedule(p_days INT DEFAULT 14)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY row_data->>'date'), '[]'::json)
    FROM (
      SELECT json_build_object(
        'date', dm.date,
        'movie_id', dm.movie_id,
        'title', m.title,
        'diff', m.diff
      ) AS row_data
      FROM cc_daily_movies dm
      JOIN cc_movies m ON m.id = dm.movie_id
      WHERE dm.date >= CURRENT_DATE - 7 AND dm.date <= CURRENT_DATE + p_days
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Streak distribution
CREATE OR REPLACE FUNCTION cc_admin_streak_distribution()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(json_build_object('streak', streak_current, 'count', cnt) ORDER BY streak_current), '[]'::json)
    FROM (
      SELECT streak_current, COUNT(*) AS cnt
      FROM cc_profiles WHERE games_played > 0
      GROUP BY streak_current
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Score distribution by mode
CREATE OR REPLACE FUNCTION cc_admin_score_distribution()
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'solo', (
      SELECT COALESCE(json_agg(json_build_object('score', total_score, 'count', cnt) ORDER BY total_score), '[]'::json)
      FROM (
        SELECT total_score, COUNT(*) AS cnt
        FROM cc_games WHERE mode = 'solo' AND completed
        GROUP BY total_score
      ) sub
    ),
    'daily', (
      SELECT COALESCE(json_agg(json_build_object('score', total_score, 'count', cnt) ORDER BY total_score), '[]'::json)
      FROM (
        SELECT total_score, COUNT(*) AS cnt
        FROM cc_games WHERE mode = 'daily' AND completed
        GROUP BY total_score
      ) sub
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Manually schedule a daily movie
CREATE OR REPLACE FUNCTION cc_admin_schedule_daily(p_movie_id INT, p_date DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO cc_daily_movies (movie_id, date) VALUES (p_movie_id, p_date)
  ON CONFLICT (date) DO UPDATE SET movie_id = EXCLUDED.movie_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant all to authenticated (admin check happens in app)
GRANT EXECUTE ON FUNCTION cc_admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_games_per_day(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_elo_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_movie_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_retention(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_mission_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_recent_games(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_users(INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_daily_schedule(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_streak_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_score_distribution() TO authenticated;
GRANT EXECUTE ON FUNCTION cc_admin_schedule_daily(INT, DATE) TO authenticated;
