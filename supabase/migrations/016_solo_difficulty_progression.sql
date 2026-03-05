-- CineClue Migration 016: Solo difficulty progression
-- Movies now go from easy to hard: 1 fácil → 2 medio → 2 difícil

CREATE OR REPLACE FUNCTION cc_select_solo_movies()
RETURNS SETOF cc_movies AS $$
  (SELECT * FROM cc_movies WHERE active = true AND diff = 'fácil'   ORDER BY random() LIMIT 1)
  UNION ALL
  (SELECT * FROM cc_movies WHERE active = true AND diff = 'medio'   ORDER BY random() LIMIT 2)
  UNION ALL
  (SELECT * FROM cc_movies WHERE active = true AND diff = 'difícil' ORDER BY random() LIMIT 2)
$$ LANGUAGE sql STABLE;
