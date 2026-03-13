-- Migration 019: Add auto_advance to party rooms
-- When enabled, host auto-advances to next round after round_end (4s delay client-side)

ALTER TABLE cc_party_rooms ADD COLUMN auto_advance BOOLEAN NOT NULL DEFAULT FALSE;

-- Recreate cc_party_create_room with p_auto_advance param
DROP FUNCTION IF EXISTS cc_party_create_room(UUID, INT);

CREATE OR REPLACE FUNCTION cc_party_create_room(
  p_host_user_id UUID DEFAULT NULL,
  p_num_rounds INT DEFAULT 5,
  p_auto_advance BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  v_code CHAR(4);
  v_room_id UUID;
  v_attempts INT := 0;
BEGIN
  IF p_num_rounds NOT IN (5, 10, 15) THEN
    RAISE EXCEPTION 'num_rounds must be 5, 10, or 15';
  END IF;

  LOOP
    v_code := upper(substr(md5(random()::text), 1, 4));
    v_code := replace(replace(replace(v_code, 'O', 'X'), 'I', 'Y'), '0', 'Z');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM cc_party_rooms WHERE code = v_code AND status IN ('waiting', 'playing'));
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN RAISE EXCEPTION 'Could not generate unique code'; END IF;
  END LOOP;

  INSERT INTO cc_party_rooms (code, host_user_id, num_rounds, auto_advance)
  VALUES (v_code, p_host_user_id, p_num_rounds, p_auto_advance)
  RETURNING id INTO v_room_id;

  RETURN json_build_object(
    'room_id', v_room_id,
    'code', v_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_create_room(UUID, INT, BOOLEAN) TO anon, authenticated;

-- Update cc_party_join_room to return auto_advance
DROP FUNCTION IF EXISTS cc_party_join_room(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION cc_party_join_room(p_code TEXT, p_display_name TEXT, p_avatar TEXT DEFAULT '🎬')
RETURNS JSON AS $$
DECLARE
  v_room RECORD;
  v_player_id UUID;
  v_player_count INT;
BEGIN
  SELECT * INTO v_room FROM cc_party_rooms WHERE code = upper(p_code) AND status = 'waiting';
  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Room not found or already started';
  END IF;

  SELECT COUNT(*) INTO v_player_count FROM cc_party_players WHERE room_id = v_room.id;
  IF v_player_count >= 20 THEN
    RAISE EXCEPTION 'Room is full (max 20 players)';
  END IF;

  INSERT INTO cc_party_players (room_id, display_name, avatar)
  VALUES (v_room.id, p_display_name, p_avatar)
  RETURNING id INTO v_player_id;

  RETURN json_build_object(
    'player_id', v_player_id,
    'room_id', v_room.id,
    'code', v_room.code,
    'num_rounds', v_room.num_rounds,
    'auto_advance', v_room.auto_advance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cc_party_join_room(TEXT, TEXT, TEXT) TO anon, authenticated;
