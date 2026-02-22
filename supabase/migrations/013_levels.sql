-- 013_levels.sql: Level system with names, icons, and admin CRUD

-- ============================================================
-- TABLE: cc_levels
-- ============================================================
CREATE TABLE cc_levels (
  level INT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🎬',
  min_xp INT NOT NULL UNIQUE
);

-- RLS: everyone can read, writes via RPCs (SECURITY DEFINER)
ALTER TABLE cc_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_levels_read" ON cc_levels FOR SELECT USING (true);

-- ============================================================
-- SEED 20 LEVELS
-- ============================================================
INSERT INTO cc_levels (level, name, icon, min_xp) VALUES
  (1,  'Extra',            '🎬', 0),
  (2,  'Figurante',        '👤', 100),
  (3,  'Espectador',       '🍿', 280),
  (4,  'Butaquero',        '💺', 520),
  (5,  'Habitué',          '🎟', 800),
  (6,  'Cinéfilo',         '🎞', 1200),
  (7,  'Maratonista',      '📀', 1700),
  (8,  'Crítico Amateur',  '✏️', 2300),
  (9,  'Crítico',          '📝', 3000),
  (10, 'Curador',          '🎭', 3800),
  (11, 'Proyeccionista',   '🔦', 4800),
  (12, 'Guionista',        '📜', 6000),
  (13, 'Director',         '🎥', 7500),
  (14, 'Auteur',           '🎬', 9500),
  (15, 'Productor',        '💰', 12000),
  (16, 'Magnate',          '🏛', 15000),
  (17, 'Leyenda',          '⭐', 20000),
  (18, 'Inmortal',         '💎', 27000),
  (19, 'Olimpo del Cine',  '👑', 36000),
  (20, 'Dios del Cine',    '🏆', 50000);

-- ============================================================
-- REPLACE cc_level_from_xp (was formula-based in 005)
-- ============================================================
CREATE OR REPLACE FUNCTION cc_level_from_xp(p_xp INT) RETURNS INT AS $$
  SELECT COALESCE(
    (SELECT level FROM cc_levels WHERE min_xp <= p_xp ORDER BY min_xp DESC LIMIT 1),
    1
  );
$$ LANGUAGE sql STABLE;

-- ============================================================
-- cc_get_levels: public read for frontend cache
-- ============================================================
CREATE OR REPLACE FUNCTION cc_get_levels() RETURNS JSON AS $$
  SELECT COALESCE(json_agg(
    json_build_object('level', level, 'name', name, 'icon', icon, 'min_xp', min_xp)
    ORDER BY level
  ), '[]'::json)
  FROM cc_levels;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- cc_get_level_info: level details for a given XP amount
-- ============================================================
CREATE OR REPLACE FUNCTION cc_get_level_info(p_xp INT) RETURNS JSON AS $$
DECLARE
  v_current cc_levels%ROWTYPE;
  v_next cc_levels%ROWTYPE;
BEGIN
  SELECT * INTO v_current FROM cc_levels WHERE min_xp <= p_xp ORDER BY min_xp DESC LIMIT 1;
  SELECT * INTO v_next FROM cc_levels WHERE min_xp > p_xp ORDER BY min_xp ASC LIMIT 1;

  IF v_current IS NULL THEN
    v_current.level := 1;
    v_current.name := 'Extra';
    v_current.icon := '🎬';
    v_current.min_xp := 0;
  END IF;

  RETURN json_build_object(
    'level', v_current.level,
    'name', v_current.name,
    'icon', v_current.icon,
    'current_xp', p_xp - v_current.min_xp,
    'needed_xp', CASE WHEN v_next.level IS NOT NULL THEN v_next.min_xp - v_current.min_xp ELSE NULL END,
    'percent', CASE WHEN v_next.level IS NOT NULL
      THEN round(((p_xp - v_current.min_xp)::numeric / (v_next.min_xp - v_current.min_xp)) * 100)
      ELSE 100 END,
    'is_max', v_next.level IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- ADMIN RPCs
-- ============================================================

-- Upsert level
CREATE OR REPLACE FUNCTION cc_admin_upsert_level(
  p_level INT,
  p_name TEXT,
  p_icon TEXT,
  p_min_xp INT
) RETURNS VOID AS $$
BEGIN
  -- Admin check
  IF NOT EXISTS (SELECT 1 FROM cc_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not admin';
  END IF;

  IF p_level < 1 THEN RAISE EXCEPTION 'Level must be >= 1'; END IF;
  IF p_min_xp < 0 THEN RAISE EXCEPTION 'min_xp must be >= 0'; END IF;

  INSERT INTO cc_levels (level, name, icon, min_xp)
  VALUES (p_level, p_name, p_icon, p_min_xp)
  ON CONFLICT (level) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    min_xp = EXCLUDED.min_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete level
CREATE OR REPLACE FUNCTION cc_admin_delete_level(p_level INT) RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cc_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not admin';
  END IF;

  IF p_level = 1 THEN RAISE EXCEPTION 'Cannot delete level 1'; END IF;

  DELETE FROM cc_levels WHERE level = p_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- List levels with user counts (admin)
CREATE OR REPLACE FUNCTION cc_admin_get_levels() RETURNS JSON AS $$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.level), '[]'::json)
  FROM (
    SELECT
      l.level,
      l.name,
      l.icon,
      l.min_xp,
      COALESCE(u.user_count, 0) AS user_count
    FROM cc_levels l
    LEFT JOIN (
      SELECT cc_level_from_xp(xp) AS lvl, COUNT(*) AS user_count
      FROM cc_profiles
      GROUP BY cc_level_from_xp(xp)
    ) u ON u.lvl = l.level
  ) t;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
