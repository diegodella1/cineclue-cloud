-- CineClue Migration 008: User Category Stats + Public Profile

CREATE TABLE cc_user_category_stats (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES cc_profiles(id),
  category_type TEXT NOT NULL CHECK (category_type IN ('genre','country','decade')),
  category_value TEXT NOT NULL,
  guessed INT DEFAULT 0,
  played INT DEFAULT 0,
  UNIQUE(user_id, category_type, category_value)
);

CREATE INDEX idx_cc_user_category_stats_user ON cc_user_category_stats(user_id, category_type);

ALTER TABLE cc_user_category_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_user_category_stats_select" ON cc_user_category_stats FOR SELECT USING (true);

-- Update category stats after each game
CREATE OR REPLACE FUNCTION cc_update_category_stats(
  p_user_id UUID,
  p_movies_played JSONB
)
RETURNS void AS $$
DECLARE
  v_elem JSONB;
  v_movie cc_movies%ROWTYPE;
  v_guessed BOOLEAN;
  v_genre TEXT;
BEGIN
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_movies_played) LOOP
    SELECT * INTO v_movie FROM cc_movies WHERE id = (v_elem->>'movie_id')::int;
    v_guessed := (v_elem->>'guessed')::boolean;

    -- Genres
    IF v_movie.genres IS NOT NULL THEN
      FOREACH v_genre IN ARRAY v_movie.genres LOOP
        INSERT INTO cc_user_category_stats (user_id, category_type, category_value, guessed, played)
        VALUES (p_user_id, 'genre', v_genre, CASE WHEN v_guessed THEN 1 ELSE 0 END, 1)
        ON CONFLICT (user_id, category_type, category_value) DO UPDATE SET
          guessed = cc_user_category_stats.guessed + CASE WHEN v_guessed THEN 1 ELSE 0 END,
          played = cc_user_category_stats.played + 1;
      END LOOP;
    END IF;

    -- Country
    IF v_movie.country IS NOT NULL THEN
      INSERT INTO cc_user_category_stats (user_id, category_type, category_value, guessed, played)
      VALUES (p_user_id, 'country', v_movie.country, CASE WHEN v_guessed THEN 1 ELSE 0 END, 1)
      ON CONFLICT (user_id, category_type, category_value) DO UPDATE SET
        guessed = cc_user_category_stats.guessed + CASE WHEN v_guessed THEN 1 ELSE 0 END,
        played = cc_user_category_stats.played + 1;
    END IF;

    -- Decade
    IF v_movie.decade IS NOT NULL THEN
      INSERT INTO cc_user_category_stats (user_id, category_type, category_value, guessed, played)
      VALUES (p_user_id, 'decade', v_movie.decade::text, CASE WHEN v_guessed THEN 1 ELSE 0 END, 1)
      ON CONFLICT (user_id, category_type, category_value) DO UPDATE SET
        guessed = cc_user_category_stats.guessed + CASE WHEN v_guessed THEN 1 ELSE 0 END,
        played = cc_user_category_stats.played + 1;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public profile function
CREATE OR REPLACE FUNCTION cc_get_public_profile(p_username TEXT)
RETURNS JSON AS $$
DECLARE
  v_profile cc_profiles%ROWTYPE;
  v_badges JSON;
  v_category_stats JSON;
BEGIN
  SELECT * INTO v_profile FROM cc_profiles WHERE username = p_username;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT json_agg(json_build_object(
    'slug', b.slug, 'name', b.name, 'description', b.description, 'icon', b.icon, 'earned_at', ub.earned_at
  )) INTO v_badges
  FROM cc_user_badges ub
  JOIN cc_badges b ON b.slug = ub.badge_slug
  WHERE ub.user_id = v_profile.id;

  SELECT json_agg(json_build_object(
    'category_type', category_type,
    'category_value', category_value,
    'guessed', guessed,
    'played', played,
    'rate', CASE WHEN played > 0 THEN round((guessed::numeric / played) * 100) ELSE 0 END
  )) INTO v_category_stats
  FROM cc_user_category_stats
  WHERE user_id = v_profile.id;

  RETURN json_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'elo', v_profile.elo,
    'xp', v_profile.xp,
    'level', v_profile.level,
    'streak_current', v_profile.streak_current,
    'streak_best', v_profile.streak_best,
    'games_played', v_profile.games_played,
    'games_completed', v_profile.games_completed,
    'total_score', v_profile.total_score,
    'created_at', v_profile.created_at,
    'badges', COALESCE(v_badges, '[]'::json),
    'category_stats', COALESCE(v_category_stats, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Integrate category stats into cc_complete_game
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
    'streak_bonus_xp', CASE WHEN p_mode = 'daily' THEN v_streak_result.streak_bonus_xp ELSE 0 END,
    'mission_xp', (v_mission_result->>'mission_xp')::int
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT SELECT ON cc_user_category_stats TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cc_get_public_profile(TEXT) TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
