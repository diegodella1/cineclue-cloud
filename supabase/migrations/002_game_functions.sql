-- CineClue Migration 002: Game Functions

-- Select 5 movies for Solo mode: 2 easy + 2 medium + 1 hard
CREATE OR REPLACE FUNCTION cc_select_solo_movies()
RETURNS SETOF cc_movies AS $$
  (SELECT * FROM cc_movies WHERE active = true AND diff = 'fácil' ORDER BY random() LIMIT 2)
  UNION ALL
  (SELECT * FROM cc_movies WHERE active = true AND diff = 'medio' ORDER BY random() LIMIT 2)
  UNION ALL
  (SELECT * FROM cc_movies WHERE active = true AND diff = 'difícil' ORDER BY random() LIMIT 1)
$$ LANGUAGE sql STABLE;

-- Complete a game (MVP version: basic stats update)
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
BEGIN
  -- Get current profile
  SELECT * INTO v_profile FROM cc_profiles WHERE id = p_user_id;

  -- Insert game record
  INSERT INTO cc_games (user_id, mode, completed, total_score, max_possible, movies_played, elo_before, elo_after, elo_delta)
  VALUES (p_user_id, p_mode, true, p_total_score, p_max_possible, p_movies_played, v_profile.elo, v_profile.elo, 0)
  RETURNING id INTO v_game_id;

  -- Update basic profile stats
  UPDATE cc_profiles SET
    games_played = games_played + 1,
    games_completed = games_completed + 1,
    total_score = total_score + p_total_score
  WHERE id = p_user_id;

  RETURN json_build_object(
    'game_id', v_game_id,
    'total_score', p_total_score,
    'elo_delta', 0,
    'new_elo', v_profile.elo
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
