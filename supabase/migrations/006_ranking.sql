-- CineClue Migration 006: Weekly Rankings + Hall of Fame

CREATE TABLE cc_weekly_rankings (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES cc_profiles(id),
  week_start DATE NOT NULL,
  score INT DEFAULT 0,
  games_played INT DEFAULT 0,
  elo_at_end INT,
  position INT,
  UNIQUE(user_id, week_start)
);

CREATE TABLE cc_hall_of_fame (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES cc_profiles(id),
  week_start DATE NOT NULL,
  position INT NOT NULL,
  score INT NOT NULL,
  elo INT NOT NULL
);

CREATE INDEX idx_cc_weekly_rankings_week ON cc_weekly_rankings(week_start, score DESC);

ALTER TABLE cc_weekly_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_hall_of_fame ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_weekly_rankings_select" ON cc_weekly_rankings FOR SELECT USING (true);
CREATE POLICY "cc_hall_of_fame_select" ON cc_hall_of_fame FOR SELECT USING (true);

-- Upsert weekly ranking after each game
CREATE OR REPLACE FUNCTION cc_upsert_weekly_ranking(
  p_user_id UUID,
  p_score INT
)
RETURNS void AS $$
DECLARE
  v_week_start DATE;
  v_elo INT;
BEGIN
  -- Get current Monday (week start)
  v_week_start := date_trunc('week', CURRENT_DATE)::date;

  SELECT elo INTO v_elo FROM cc_profiles WHERE id = p_user_id;

  INSERT INTO cc_weekly_rankings (user_id, week_start, score, games_played, elo_at_end)
  VALUES (p_user_id, v_week_start, p_score, 1, v_elo)
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    score = cc_weekly_rankings.score + p_score,
    games_played = cc_weekly_rankings.games_played + 1,
    elo_at_end = v_elo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get ranking with pagination + user position
CREATE OR REPLACE FUNCTION cc_get_ranking(p_user_id UUID DEFAULT NULL, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS JSON AS $$
DECLARE
  v_week_start DATE;
  v_ranking JSON;
  v_user_pos JSON;
  v_total INT;
BEGIN
  v_week_start := date_trunc('week', CURRENT_DATE)::date;

  SELECT COUNT(*) INTO v_total FROM cc_weekly_rankings WHERE week_start = v_week_start;

  SELECT json_agg(row_data) INTO v_ranking FROM (
    SELECT
      row_number() OVER (ORDER BY wr.elo_at_end DESC, wr.games_played DESC) AS position,
      wr.user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.elo,
      wr.score,
      wr.games_played
    FROM cc_weekly_rankings wr
    JOIN cc_profiles p ON p.id = wr.user_id
    WHERE wr.week_start = v_week_start
    ORDER BY wr.elo_at_end DESC, wr.games_played DESC
    LIMIT p_limit OFFSET p_offset
  ) row_data;

  -- User's own position
  IF p_user_id IS NOT NULL THEN
    SELECT json_build_object(
      'position', sub.position,
      'score', sub.score,
      'elo', sub.elo
    ) INTO v_user_pos FROM (
      SELECT
        row_number() OVER (ORDER BY wr.elo_at_end DESC, wr.games_played DESC) AS position,
        wr.user_id,
        wr.score,
        wr.elo_at_end as elo
      FROM cc_weekly_rankings wr
      WHERE wr.week_start = v_week_start
    ) sub WHERE sub.user_id = p_user_id;
  END IF;

  RETURN json_build_object(
    'week_start', v_week_start,
    'total', v_total,
    'ranking', COALESCE(v_ranking, '[]'::json),
    'user_position', v_user_pos
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Reset weekly ranking (archive top 3 to hall of fame)
CREATE OR REPLACE FUNCTION cc_reset_weekly_ranking()
RETURNS void AS $$
DECLARE
  v_week_start DATE;
BEGIN
  v_week_start := date_trunc('week', CURRENT_DATE - interval '7 days')::date;

  -- Archive top 3
  INSERT INTO cc_hall_of_fame (user_id, week_start, position, score, elo)
  SELECT user_id, v_week_start, row_number() OVER (ORDER BY elo_at_end DESC, games_played DESC), score, elo_at_end
  FROM cc_weekly_rankings
  WHERE week_start = v_week_start
  ORDER BY elo_at_end DESC, games_played DESC
  LIMIT 3;
END;
$$ LANGUAGE plpgsql;

-- Add upsert call to cc_complete_game
-- We need to update cc_complete_game to also call cc_upsert_weekly_ranking
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
    v_xp_earned := v_xp_earned + COALESCE(v_streak_result.streak_bonus_xp, 0);
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

  -- Update weekly ranking
  PERFORM cc_upsert_weekly_ranking(p_user_id, p_total_score);

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

-- Cron: reset ranking every Monday at 03:00 UTC
SELECT cron.schedule('cc-weekly-reset', '0 3 * * 1', $$SELECT cc_reset_weekly_ranking()$$);

-- Grants
GRANT SELECT ON cc_weekly_rankings TO anon, authenticated;
GRANT SELECT ON cc_hall_of_fame TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cc_get_ranking(UUID, INT, INT) TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
