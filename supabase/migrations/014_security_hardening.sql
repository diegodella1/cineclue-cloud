-- 014_security_hardening.sql: Auth checks, admin checks, score validation, rate limits
-- Fixes: S1-S12 from security audit

-- ============================================================
-- HELPER: reusable admin check (reduces boilerplate)
-- ============================================================
CREATE OR REPLACE FUNCTION cc_require_admin() RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- S1: ADD ADMIN CHECK TO ALL 12 cc_admin_* FUNCTIONS
-- ============================================================

-- 1. cc_admin_overview
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
BEGIN
  PERFORM cc_require_admin();

  SELECT COUNT(*) INTO v_total_users FROM cc_profiles;
  SELECT COUNT(*) INTO v_total_games FROM cc_games WHERE completed;
  SELECT COUNT(*) INTO v_today_games FROM cc_games WHERE completed AND played_at::date = CURRENT_DATE;
  SELECT COUNT(DISTINCT user_id) INTO v_today_users FROM cc_games WHERE completed AND played_at::date = CURRENT_DATE;
  SELECT COUNT(*) INTO v_week_games FROM cc_games WHERE completed AND played_at >= date_trunc('week', CURRENT_DATE);
  SELECT COUNT(DISTINCT user_id) INTO v_week_users FROM cc_games WHERE completed AND played_at >= date_trunc('week', CURRENT_DATE);
  SELECT COALESCE(round(AVG(total_score)::numeric, 1), 0) INTO v_avg_score FROM cc_games WHERE completed;
  SELECT COALESCE(round(AVG(elo)::numeric, 0), 1000) INTO v_avg_elo FROM cc_profiles WHERE games_played > 0;
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

-- 2. cc_admin_games_per_day
CREATE OR REPLACE FUNCTION cc_admin_games_per_day(p_days INT DEFAULT 30)
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
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
        SELECT played_at::date AS day, COUNT(*) AS cnt,
          COUNT(*) FILTER (WHERE mode = 'solo') AS solo,
          COUNT(*) FILTER (WHERE mode = 'daily') AS daily,
          COUNT(*) FILTER (WHERE mode = 'duel_local') AS duel,
          COUNT(DISTINCT user_id) AS uu
        FROM cc_games WHERE completed GROUP BY played_at::date
      ) g ON g.day = d::date
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. cc_admin_elo_distribution
CREATE OR REPLACE FUNCTION cc_admin_elo_distribution()
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
  RETURN (
    SELECT COALESCE(json_agg(json_build_object('bucket', bucket, 'count', cnt) ORDER BY bucket), '[]'::json)
    FROM (
      SELECT floor(elo / 100) * 100 AS bucket, COUNT(*) AS cnt
      FROM cc_profiles WHERE games_played > 0 GROUP BY bucket
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. cc_admin_movie_stats
CREATE OR REPLACE FUNCTION cc_admin_movie_stats()
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY (row_data->>'hit_rate')::numeric DESC), '[]'::json)
    FROM (
      SELECT json_build_object(
        'movie_id', m.id, 'title', m.title, 'diff', m.diff,
        'times_played', COALESCE(s.played, 0),
        'times_guessed', COALESCE(s.guessed, 0),
        'hit_rate', CASE WHEN COALESCE(s.played, 0) > 0 THEN round((s.guessed::numeric / s.played) * 100, 1) ELSE 0 END,
        'avg_clue', COALESCE(s.avg_clue, 0),
        'active', m.active
      ) AS row_data
      FROM cc_movies m
      LEFT JOIN (
        SELECT (elem->>'movie_id')::int AS movie_id, COUNT(*) AS played,
          COUNT(*) FILTER (WHERE (elem->>'guessed')::boolean) AS guessed,
          round(AVG((elem->>'clue_revealed')::numeric) FILTER (WHERE (elem->>'guessed')::boolean), 1) AS avg_clue
        FROM cc_games g, jsonb_array_elements(g.movies_played) elem
        WHERE g.completed GROUP BY (elem->>'movie_id')::int
      ) s ON s.movie_id = m.id
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. cc_admin_retention
CREATE OR REPLACE FUNCTION cc_admin_retention(p_days INT DEFAULT 14)
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
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
        SELECT created_at::date AS day, COUNT(*) AS cnt FROM cc_profiles GROUP BY created_at::date
      ) n ON n.day = d::date
      LEFT JOIN (
        SELECT played_at::date AS day, COUNT(DISTINCT user_id) FILTER (
          WHERE user_id IN (SELECT DISTINCT user_id FROM cc_games WHERE played_at::date = cc_games.played_at::date - 1)
        ) AS cnt FROM cc_games WHERE completed GROUP BY played_at::date
      ) r ON r.day = d::date
      LEFT JOIN (
        SELECT played_at::date AS day, COUNT(DISTINCT user_id) AS cnt
        FROM cc_games WHERE completed GROUP BY played_at::date
      ) a ON a.day = d::date
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 6. cc_admin_mission_stats
CREATE OR REPLACE FUNCTION cc_admin_mission_stats()
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY (row_data->>'completion_rate')::numeric DESC), '[]'::json)
    FROM (
      SELECT json_build_object(
        'id', m.id, 'slug', m.slug, 'title', m.title, 'type', m.type,
        'total_started', COALESCE(s.started, 0),
        'total_completed', COALESCE(s.completed, 0),
        'completion_rate', CASE WHEN COALESCE(s.started, 0) > 0 THEN round((s.completed::numeric / s.started) * 100, 1) ELSE 0 END
      ) AS row_data
      FROM cc_missions m
      LEFT JOIN (
        SELECT mission_id, COUNT(*) AS started, COUNT(*) FILTER (WHERE completed) AS completed
        FROM cc_mission_progress GROUP BY mission_id
      ) s ON s.mission_id = m.id
      WHERE m.active
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 7. cc_admin_recent_games
CREATE OR REPLACE FUNCTION cc_admin_recent_games(p_limit INT DEFAULT 50)
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
  RETURN (
    SELECT COALESCE(json_agg(row_data), '[]'::json)
    FROM (
      SELECT json_build_object(
        'game_id', g.id, 'username', p.username, 'display_name', p.display_name,
        'mode', g.mode, 'total_score', g.total_score, 'max_possible', g.max_possible,
        'elo_delta', g.elo_delta, 'played_at', g.played_at
      ) AS row_data
      FROM cc_games g JOIN cc_profiles p ON p.id = g.user_id
      WHERE g.completed ORDER BY g.played_at DESC LIMIT p_limit
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 8. cc_admin_users
CREATE OR REPLACE FUNCTION cc_admin_users(p_limit INT DEFAULT 100, p_offset INT DEFAULT 0, p_sort TEXT DEFAULT 'created_at')
RETURNS JSON AS $$
DECLARE
  v_users JSON;
  v_total INT;
BEGIN
  PERFORM cc_require_admin();

  SELECT COUNT(*) INTO v_total FROM cc_profiles;
  SELECT json_agg(row_data) INTO v_users FROM (
    SELECT json_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'elo', p.elo, 'xp', p.xp, 'level', p.level,
      'games_played', p.games_played, 'total_score', p.total_score,
      'streak_current', p.streak_current, 'streak_best', p.streak_best,
      'created_at', p.created_at,
      'last_played', (SELECT MAX(played_at) FROM cc_games WHERE user_id = p.id),
      'is_admin', EXISTS (SELECT 1 FROM cc_admins WHERE user_id = p.id)
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

-- 9. cc_admin_daily_schedule
CREATE OR REPLACE FUNCTION cc_admin_daily_schedule(p_days INT DEFAULT 14)
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
  RETURN (
    SELECT COALESCE(json_agg(row_data ORDER BY row_data->>'date'), '[]'::json)
    FROM (
      SELECT json_build_object(
        'date', dm.date, 'movie_id', dm.movie_id, 'title', m.title, 'diff', m.diff
      ) AS row_data
      FROM cc_daily_movies dm JOIN cc_movies m ON m.id = dm.movie_id
      WHERE dm.date >= CURRENT_DATE - 7 AND dm.date <= CURRENT_DATE + p_days
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 10. cc_admin_streak_distribution
CREATE OR REPLACE FUNCTION cc_admin_streak_distribution()
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
  RETURN (
    SELECT COALESCE(json_agg(json_build_object('streak', streak_current, 'count', cnt) ORDER BY streak_current), '[]'::json)
    FROM (
      SELECT streak_current, COUNT(*) AS cnt FROM cc_profiles WHERE games_played > 0 GROUP BY streak_current
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 11. cc_admin_score_distribution
CREATE OR REPLACE FUNCTION cc_admin_score_distribution()
RETURNS JSON AS $$
BEGIN
  PERFORM cc_require_admin();
  RETURN json_build_object(
    'solo', (
      SELECT COALESCE(json_agg(json_build_object('score', total_score, 'count', cnt) ORDER BY total_score), '[]'::json)
      FROM (SELECT total_score, COUNT(*) AS cnt FROM cc_games WHERE mode = 'solo' AND completed GROUP BY total_score) sub
    ),
    'daily', (
      SELECT COALESCE(json_agg(json_build_object('score', total_score, 'count', cnt) ORDER BY total_score), '[]'::json)
      FROM (SELECT total_score, COUNT(*) AS cnt FROM cc_games WHERE mode = 'daily' AND completed GROUP BY total_score) sub
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 12. cc_admin_schedule_daily
CREATE OR REPLACE FUNCTION cc_admin_schedule_daily(p_movie_id INT, p_date DATE)
RETURNS void AS $$
BEGIN
  PERFORM cc_require_admin();
  INSERT INTO cc_daily_movies (movie_id, date) VALUES (p_movie_id, p_date)
  ON CONFLICT (date) DO UPDATE SET movie_id = EXCLUDED.movie_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- S7: REVOKE cc_schedule_daily_movie FROM authenticated
-- ============================================================
REVOKE EXECUTE ON FUNCTION cc_schedule_daily_movie() FROM authenticated;

-- ============================================================
-- S2 + S6 + S8: HARDEN cc_complete_game
-- - Verify p_user_id = auth.uid()
-- - Validate scores server-side
-- - Prevent daily replay
-- ============================================================
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
  v_mission_result JSON;
  v_streak INT := 0;
  v_streak_bonus_xp INT := 0;
  v_calculated_score INT;
  v_movie_count INT;
  v_elem JSONB;
  v_pts INT;
BEGIN
  -- S2: Auth check
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- S6: Score validation
  v_movie_count := jsonb_array_length(p_movies_played);
  IF v_movie_count < 1 OR v_movie_count > 5 THEN
    RAISE EXCEPTION 'Invalid movie count';
  END IF;
  IF p_max_possible != v_movie_count * 5 THEN
    RAISE EXCEPTION 'Invalid max_possible';
  END IF;

  -- Recalculate total from individual rounds
  v_calculated_score := 0;
  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_movies_played)
  LOOP
    v_pts := COALESCE((v_elem->>'points_earned')::int, 0);
    IF v_pts < 0 OR v_pts > 5 THEN
      RAISE EXCEPTION 'Invalid points_earned';
    END IF;
    -- If not guessed, points must be 0
    IF NOT COALESCE((v_elem->>'guessed')::boolean, false) AND v_pts != 0 THEN
      RAISE EXCEPTION 'Invalid score: unguessed movie with points';
    END IF;
    v_calculated_score := v_calculated_score + v_pts;
  END LOOP;

  IF p_total_score != v_calculated_score THEN
    RAISE EXCEPTION 'Score mismatch';
  END IF;

  -- S8: Daily replay prevention
  IF p_mode = 'daily' AND EXISTS (
    SELECT 1 FROM cc_games
    WHERE user_id = p_user_id AND mode = 'daily' AND completed
    AND played_at::date = CURRENT_DATE
  ) THEN
    RAISE EXCEPTION 'Already played daily today';
  END IF;

  -- Original logic (unchanged)
  SELECT * INTO v_profile FROM cc_profiles WHERE id = p_user_id;

  SELECT array_agg(m.diff) INTO v_diffs
  FROM jsonb_array_elements(p_movies_played) elem
  JOIN cc_movies m ON m.id = (elem->>'movie_id')::int;

  SELECT * INTO v_elo_result FROM cc_calculate_elo(
    v_profile.elo, v_profile.games_played, p_total_score, p_max_possible, v_diffs
  );

  v_xp_earned := cc_calculate_xp(p_mode, p_movies_played);

  IF p_mode = 'daily' THEN
    SELECT * INTO v_streak_result FROM cc_update_streak(p_user_id);
    v_streak_bonus_xp := COALESCE(v_streak_result.streak_bonus_xp, 0);
    v_xp_earned := v_xp_earned + v_streak_bonus_xp;
    v_streak := v_streak_result.new_streak;
  ELSE
    v_streak := v_profile.streak_current;
  END IF;

  v_new_xp := v_profile.xp + v_xp_earned;
  v_new_level := cc_level_from_xp(v_new_xp);

  INSERT INTO cc_games (user_id, mode, completed, total_score, max_possible, movies_played, elo_before, elo_after, elo_delta)
  VALUES (p_user_id, p_mode, true, p_total_score, p_max_possible, p_movies_played, v_profile.elo, v_elo_result.new_elo, v_elo_result.delta)
  RETURNING id INTO v_game_id;

  UPDATE cc_profiles SET
    games_played = games_played + 1,
    games_completed = games_completed + 1,
    total_score = total_score + p_total_score,
    elo = v_elo_result.new_elo,
    xp = v_new_xp,
    level = v_new_level
  WHERE id = p_user_id;

  PERFORM cc_upsert_weekly_ranking(p_user_id, p_total_score);
  PERFORM cc_update_category_stats(p_user_id, p_movies_played);

  v_mission_result := cc_check_missions(p_user_id, p_mode, p_total_score, p_movies_played, v_streak);

  RETURN json_build_object(
    'game_id', v_game_id,
    'total_score', p_total_score,
    'elo_before', v_profile.elo,
    'elo_after', v_elo_result.new_elo,
    'elo_delta', v_elo_result.delta,
    'xp_earned', v_xp_earned,
    'new_xp', v_new_xp,
    'new_level', v_new_level,
    'streak', v_streak,
    'streak_bonus_xp', v_streak_bonus_xp,
    'mission_xp', (v_mission_result->>'mission_xp')::int
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- S3: HARDEN cc_create_duel — verify challenger = auth.uid()
-- ============================================================
CREATE OR REPLACE FUNCTION cc_create_duel(
  p_challenger_id UUID,
  p_opponent_username TEXT,
  p_challenger_score INT,
  p_challenger_results JSONB
)
RETURNS JSON AS $$
DECLARE
  v_opponent RECORD;
  v_movie_ids INT[];
  v_movies JSONB;
  v_duel_id UUID;
  v_game_result JSON;
  v_max_possible INT;
BEGIN
  -- Auth check
  IF p_challenger_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

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

  SELECT array_agg((r->>'movie_id')::INT) INTO v_movie_ids
  FROM jsonb_array_elements(p_challenger_results) AS r;

  SELECT jsonb_agg(
    jsonb_build_object('id', m.id, 'title', m.title, 'alt', m.alt, 'clues', m.clues, 'diff', m.diff, 'lb', m.lb, 'decade', m.decade)
  ) INTO v_movies FROM cc_movies m WHERE m.id = ANY(v_movie_ids);

  INSERT INTO cc_duels (challenger_id, opponent_id, challenger_score, challenger_results, movies, expires_at)
  VALUES (p_challenger_id, v_opponent.id, p_challenger_score, p_challenger_results, v_movies, NOW() + INTERVAL '12 hours')
  RETURNING id INTO v_duel_id;

  v_max_possible := jsonb_array_length(p_challenger_results) * 5;
  SELECT cc_complete_game(p_challenger_id, 'duel', p_challenger_score, v_max_possible, p_challenger_results) INTO v_game_result;

  RETURN json_build_object('duel_id', v_duel_id, 'game_result', v_game_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- S4: HARDEN cc_submit_duel_round — verify user = auth.uid()
-- ============================================================
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
  -- Auth check
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

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

  IF p_score > v_duel.challenger_score THEN
    v_winner_id := p_user_id;
  ELSIF p_score < v_duel.challenger_score THEN
    v_winner_id := v_duel.challenger_id;
  ELSE
    v_winner_id := NULL;
  END IF;

  UPDATE cc_duels SET
    opponent_score = p_score, opponent_results = p_results,
    winner_id = v_winner_id, status = 'completed', completed_at = NOW()
  WHERE id = p_duel_id;

  v_max_possible := jsonb_array_length(p_results) * 5;
  SELECT cc_complete_game(p_user_id, 'duel', p_score, v_max_possible, p_results) INTO v_game_result;

  RETURN json_build_object(
    'winner_id', v_winner_id,
    'challenger_score', v_duel.challenger_score,
    'opponent_score', p_score,
    'game_result', v_game_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- S9: HARDEN duel read functions — verify user = auth.uid()
-- ============================================================

-- cc_get_my_duels
CREATE OR REPLACE FUNCTION cc_get_my_duels(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Auto-expire stale duels
  UPDATE cc_duels SET status = 'expired'
  WHERE status = 'waiting' AND expires_at < NOW();

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- cc_get_duel_notifications
CREATE OR REPLACE FUNCTION cc_get_duel_notifications(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

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
      WHERE d.opponent_id = p_user_id AND d.status = 'waiting' AND d.expires_at > NOW()
      ORDER BY d.expires_at ASC
    ) sub
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- cc_count_pending_duels
CREATE OR REPLACE FUNCTION cc_count_pending_duels(p_user_id UUID)
RETURNS INT AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN (
    SELECT COUNT(*)::INT FROM cc_duels
    WHERE opponent_id = p_user_id AND status = 'waiting' AND expires_at > NOW()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- cc_get_duel (already has participant check, just add auth.uid())
CREATE OR REPLACE FUNCTION cc_get_duel(p_duel_id UUID, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_duel RECORD;
  v_challenger JSON;
  v_opponent JSON;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_duel FROM cc_duels WHERE id = p_duel_id;
  IF v_duel IS NULL THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;
  IF p_user_id != v_duel.challenger_id AND p_user_id != v_duel.opponent_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object('id', id, 'username', username, 'display_name', display_name, 'elo', elo, 'level', level, 'avatar_url', avatar_url)
  INTO v_challenger FROM cc_profiles WHERE id = v_duel.challenger_id;
  SELECT json_build_object('id', id, 'username', username, 'display_name', display_name, 'elo', elo, 'level', level, 'avatar_url', avatar_url)
  INTO v_opponent FROM cc_profiles WHERE id = v_duel.opponent_id;

  RETURN json_build_object(
    'id', v_duel.id, 'status', v_duel.status, 'movies', v_duel.movies,
    'challenger', v_challenger, 'opponent', v_opponent,
    'challenger_score', CASE WHEN v_duel.status != 'waiting' OR p_user_id = v_duel.challenger_id THEN v_duel.challenger_score ELSE NULL END,
    'challenger_results', CASE WHEN v_duel.status != 'waiting' OR p_user_id = v_duel.challenger_id THEN v_duel.challenger_results ELSE NULL END,
    'opponent_score', v_duel.opponent_score, 'opponent_results', v_duel.opponent_results,
    'winner_id', v_duel.winner_id, 'created_at', v_duel.created_at,
    'expires_at', v_duel.expires_at, 'completed_at', v_duel.completed_at
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- S10: SANITIZE cc_search_users wildcards + auth check
-- ============================================================
CREATE OR REPLACE FUNCTION cc_search_users(p_query TEXT, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Strip SQL LIKE wildcards
  v_clean := replace(replace(p_query, '%', ''), '_', '');
  IF length(v_clean) < 2 THEN
    RETURN '[]'::json;
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(row_data), '[]'::json) FROM (
      SELECT json_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name,
        'elo', p.elo, 'level', p.level, 'avatar_url', p.avatar_url,
        'duels_enabled', p.duels_enabled
      ) AS row_data
      FROM cc_profiles p
      WHERE p.id != p_user_id
        AND (p.username ILIKE '%' || v_clean || '%' OR p.display_name ILIKE '%' || v_clean || '%')
        AND NOT p.username LIKE 'user_%'
      ORDER BY p.elo DESC LIMIT 10
    ) sub
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- S11: display_name length constraint
-- ============================================================
ALTER TABLE cc_profiles ADD CONSTRAINT cc_profiles_display_name_len
  CHECK (length(display_name) <= 100);
