-- Migration 010: Toggle admin from admin panel
-- Adds is_admin flag to cc_admin_users and a toggle function

-- Update cc_admin_users to include is_admin
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

-- Toggle admin: only callable by existing admins
CREATE OR REPLACE FUNCTION cc_toggle_admin(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM cc_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Check if target is already admin
  SELECT EXISTS (SELECT 1 FROM cc_admins WHERE user_id = p_user_id) INTO v_is_admin;

  IF v_is_admin THEN
    -- Prevent removing yourself
    IF p_user_id = auth.uid() THEN
      RAISE EXCEPTION 'No te podés quitar admin a vos mismo';
    END IF;
    DELETE FROM cc_admins WHERE user_id = p_user_id;
    RETURN json_build_object('is_admin', false);
  ELSE
    INSERT INTO cc_admins (user_id) VALUES (p_user_id);
    RETURN json_build_object('is_admin', true);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_toggle_admin(UUID) TO authenticated;
