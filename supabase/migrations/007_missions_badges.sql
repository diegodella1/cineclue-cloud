-- CineClue Migration 007: Missions + Badges

CREATE TABLE cc_missions (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('weekly','permanent','special')),
  condition JSONB NOT NULL,
  reward_xp INT DEFAULT 0,
  reward_badge TEXT,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE cc_mission_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES cc_profiles(id),
  mission_id INT REFERENCES cc_missions(id),
  progress INT DEFAULT 0,
  target INT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  week_start DATE
);

-- Unique: one progress per user per mission per week (for weekly), or per user per mission (for permanent where week_start is NULL)
CREATE UNIQUE INDEX idx_cc_mission_progress_weekly ON cc_mission_progress(user_id, mission_id, week_start) WHERE week_start IS NOT NULL;
CREATE UNIQUE INDEX idx_cc_mission_progress_permanent ON cc_mission_progress(user_id, mission_id) WHERE week_start IS NULL;
CREATE INDEX idx_cc_mission_progress_user ON cc_mission_progress(user_id, completed);

CREATE TABLE cc_badges (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  condition JSONB NOT NULL
);

CREATE TABLE cc_user_badges (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES cc_profiles(id),
  badge_slug TEXT REFERENCES cc_badges(slug),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_slug)
);

ALTER TABLE cc_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_missions_select" ON cc_missions FOR SELECT USING (true);
CREATE POLICY "cc_mission_progress_select" ON cc_mission_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cc_badges_select" ON cc_badges FOR SELECT USING (true);
CREATE POLICY "cc_user_badges_select" ON cc_user_badges FOR SELECT USING (true);

-- Seed missions
INSERT INTO cc_missions (slug, title, description, type, condition, reward_xp) VALUES
-- Weekly
('weekly_marathon', 'Maratón', 'Completar 5 partidas esta semana', 'weekly', '{"type": "games_played", "count": 5}', 100),
('weekly_hard_eye', 'Ojo clínico', 'Adivinar 3 películas difíciles', 'weekly', '{"type": "guess_hard", "count": 3}', 150),
('weekly_streak_5', 'Cinéfilo consistente', 'Jugar la peli del día 5 días seguidos', 'weekly', '{"type": "daily_streak", "count": 5}', 200),
('weekly_speed', 'Velocista', 'Adivinar 2 películas en pista 1', 'weekly', '{"type": "guess_clue_1", "count": 2}', 120),
-- Permanent
('perm_first_blood', 'Primera sangre', 'Ganar tu primera partida', 'permanent', '{"type": "games_completed", "count": 1}', 50),
('perm_streak_3', 'Racha inicial', 'Alcanzar streak de 3 días', 'permanent', '{"type": "streak_reached", "count": 3}', 100),
('perm_elite', 'Cinéfilo de élite', 'Alcanzar 20/25 en modo Solo', 'permanent', '{"type": "solo_score_min", "count": 20}', 200),
('perm_month', 'Un mes de cine', 'Streak de 30 días', 'permanent', '{"type": "streak_reached", "count": 30}', 500),
('perm_collector', 'Coleccionista', 'Adivinar 50 películas únicas', 'permanent', '{"type": "unique_movies_guessed", "count": 50}', 300);

-- Seed badges
INSERT INTO cc_badges (slug, name, description, icon, condition) VALUES
('semana_completa', 'Semana completa', 'Streak de 7 días', 'M', '{"type": "streak_reached", "count": 7}'),
('quincena', 'Quincena', 'Streak de 14 días', 'Q', '{"type": "streak_reached", "count": 14}'),
('mes_dedicado', 'Mes dedicado', 'Streak de 30 días', 'D', '{"type": "streak_reached", "count": 30}'),
('centenario', 'Centenario', 'Streak de 100 días', 'C', '{"type": "streak_reached", "count": 100}'),
('elite', 'Cinéfilo de élite', '20/25 en modo Solo', 'E', '{"type": "solo_score_min", "count": 20}'),
('coleccionista', 'Coleccionista', '50 películas únicas adivinadas', 'K', '{"type": "unique_movies_guessed", "count": 50}');

-- Check and update mission progress after each game
CREATE OR REPLACE FUNCTION cc_check_missions(
  p_user_id UUID,
  p_mode TEXT,
  p_total_score INT,
  p_movies_played JSONB,
  p_streak INT DEFAULT 0
)
RETURNS JSON AS $$
DECLARE
  v_mission RECORD;
  v_week_start DATE;
  v_progress INT;
  v_target INT;
  v_completed_missions JSON[] := '{}';
  v_new_xp INT := 0;
  v_hard_guessed INT;
  v_clue1_guessed INT;
  v_unique_guessed INT;
  v_profile cc_profiles%ROWTYPE;
BEGIN
  v_week_start := date_trunc('week', CURRENT_DATE)::date;
  SELECT * INTO v_profile FROM cc_profiles WHERE id = p_user_id;

  -- Pre-calculate stats from this game
  SELECT COUNT(*) INTO v_hard_guessed FROM jsonb_array_elements(p_movies_played) elem
    JOIN cc_movies m ON m.id = (elem->>'movie_id')::int
    WHERE (elem->>'guessed')::boolean AND m.diff = 'difícil';

  SELECT COUNT(*) INTO v_clue1_guessed FROM jsonb_array_elements(p_movies_played) elem
    WHERE (elem->>'guessed')::boolean AND (elem->>'clue_revealed')::int = 0;

  FOR v_mission IN SELECT * FROM cc_missions WHERE active = true LOOP
    v_target := (v_mission.condition->>'count')::int;

    -- Get or create progress
    IF v_mission.type = 'weekly' THEN
      INSERT INTO cc_mission_progress (user_id, mission_id, progress, target, week_start)
      VALUES (p_user_id, v_mission.id, 0, v_target, v_week_start)
      ON CONFLICT DO NOTHING;

      SELECT progress, completed INTO v_progress FROM cc_mission_progress
      WHERE user_id = p_user_id AND mission_id = v_mission.id AND week_start = v_week_start;
    ELSE
      INSERT INTO cc_mission_progress (user_id, mission_id, progress, target)
      VALUES (p_user_id, v_mission.id, 0, v_target)
      ON CONFLICT DO NOTHING;

      SELECT progress, completed INTO v_progress FROM cc_mission_progress
      WHERE user_id = p_user_id AND mission_id = v_mission.id AND week_start IS NULL;
    END IF;

    -- Skip already completed
    CONTINUE WHEN v_progress IS NULL;

    -- Calculate new progress based on condition type
    CASE (v_mission.condition->>'type')
      WHEN 'games_played' THEN
        v_progress := v_progress + 1;
      WHEN 'guess_hard' THEN
        v_progress := v_progress + v_hard_guessed;
      WHEN 'daily_streak' THEN
        IF p_mode = 'daily' THEN v_progress := GREATEST(v_progress, p_streak); END IF;
      WHEN 'guess_clue_1' THEN
        v_progress := v_progress + v_clue1_guessed;
      WHEN 'games_completed' THEN
        v_progress := v_profile.games_completed + 1;
      WHEN 'streak_reached' THEN
        v_progress := GREATEST(v_progress, p_streak, v_profile.streak_current);
      WHEN 'solo_score_min' THEN
        IF p_mode = 'solo' AND p_total_score >= v_target THEN v_progress := v_target; END IF;
      WHEN 'unique_movies_guessed' THEN
        -- Count unique movies guessed across all games
        SELECT COUNT(DISTINCT (elem->>'movie_id')::int) INTO v_unique_guessed
        FROM cc_games g, jsonb_array_elements(g.movies_played) elem
        WHERE g.user_id = p_user_id AND (elem->>'guessed')::boolean;
        v_progress := v_unique_guessed;
      ELSE
        CONTINUE;
    END CASE;

    -- Update progress
    IF v_mission.type = 'weekly' THEN
      UPDATE cc_mission_progress SET
        progress = LEAST(v_progress, v_target),
        completed = v_progress >= v_target,
        completed_at = CASE WHEN v_progress >= v_target AND NOT completed THEN NOW() ELSE completed_at END
      WHERE user_id = p_user_id AND mission_id = v_mission.id AND week_start = v_week_start;
    ELSE
      UPDATE cc_mission_progress SET
        progress = LEAST(v_progress, v_target),
        completed = v_progress >= v_target,
        completed_at = CASE WHEN v_progress >= v_target AND NOT completed THEN NOW() ELSE completed_at END
      WHERE user_id = p_user_id AND mission_id = v_mission.id AND week_start IS NULL;
    END IF;

    -- If just completed, award XP
    IF v_progress >= v_target THEN
      v_new_xp := v_new_xp + v_mission.reward_xp;
    END IF;
  END LOOP;

  -- Apply bonus XP from missions
  IF v_new_xp > 0 THEN
    UPDATE cc_profiles SET
      xp = xp + v_new_xp,
      level = cc_level_from_xp(xp + v_new_xp)
    WHERE id = p_user_id;
  END IF;

  RETURN json_build_object('mission_xp', v_new_xp);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update cc_complete_game to check missions
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

  -- Check missions
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
GRANT SELECT ON cc_missions TO anon, authenticated;
GRANT SELECT ON cc_mission_progress TO authenticated;
GRANT SELECT ON cc_badges TO anon, authenticated;
GRANT SELECT ON cc_user_badges TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
