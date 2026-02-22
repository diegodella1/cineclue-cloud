-- CineClue Migration 001: Core Schema
-- Tablas: cc_profiles, cc_movies, cc_daily_movies, cc_games, cc_admins

-- Profiles (extensión de auth.users)
CREATE TABLE cc_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  streak_current INT DEFAULT 0,
  streak_best INT DEFAULT 0,
  streak_last_played DATE,
  elo INT DEFAULT 1000,
  xp INT DEFAULT 0,
  level INT DEFAULT 1,
  games_played INT DEFAULT 0,
  games_completed INT DEFAULT 0,
  total_score INT DEFAULT 0
);

-- Movies
CREATE TABLE cc_movies (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  alt TEXT[] DEFAULT '{}',
  diff TEXT NOT NULL CHECK (diff IN ('fácil','medio','difícil')),
  lb TEXT NOT NULL,
  clues JSONB NOT NULL,
  genres TEXT[] DEFAULT '{}',
  country TEXT,
  decade INT,
  director TEXT,
  active BOOLEAN DEFAULT TRUE
);

-- Daily movies (scheduled by cron)
CREATE TABLE cc_daily_movies (
  id SERIAL PRIMARY KEY,
  movie_id INT REFERENCES cc_movies(id),
  date DATE UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games (each play session)
CREATE TABLE cc_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES cc_profiles(id),
  mode TEXT NOT NULL CHECK (mode IN ('solo','daily','duel_local')),
  played_at TIMESTAMPTZ DEFAULT NOW(),
  completed BOOLEAN DEFAULT FALSE,
  total_score INT DEFAULT 0,
  max_possible INT DEFAULT 25,
  movies_played JSONB NOT NULL DEFAULT '[]',
  elo_before INT,
  elo_after INT,
  elo_delta INT
);

-- Admins
CREATE TABLE cc_admins (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES cc_profiles(id) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cc_games_user_mode ON cc_games(user_id, mode);
CREATE INDEX idx_cc_daily_movies_date ON cc_daily_movies(date);
CREATE INDEX idx_cc_movies_active_diff ON cc_movies(active, diff);

-- RLS
ALTER TABLE cc_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_daily_movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_admins ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "cc_profiles_select" ON cc_profiles FOR SELECT USING (true);
CREATE POLICY "cc_profiles_insert" ON cc_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "cc_profiles_update" ON cc_profiles FOR UPDATE USING (auth.uid() = id);

-- Movies: everyone can read active
CREATE POLICY "cc_movies_select" ON cc_movies FOR SELECT USING (true);
-- Admin insert/update handled by service role or separate policy
CREATE POLICY "cc_movies_admin_insert" ON cc_movies FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM cc_admins WHERE user_id = auth.uid()));
CREATE POLICY "cc_movies_admin_update" ON cc_movies FOR UPDATE
  USING (EXISTS (SELECT 1 FROM cc_admins WHERE user_id = auth.uid()));

-- Daily movies: everyone can read
CREATE POLICY "cc_daily_movies_select" ON cc_daily_movies FOR SELECT USING (true);

-- Games: users can read own, insert own
CREATE POLICY "cc_games_select" ON cc_games FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cc_games_insert" ON cc_games FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins: only admins can read
CREATE POLICY "cc_admins_select" ON cc_admins FOR SELECT USING (auth.uid() = user_id);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION cc_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cc_profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    'user_' || substr(NEW.id::text, 1, 8),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Cinéfilo'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS cc_on_auth_user_created ON auth.users;
CREATE TRIGGER cc_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION cc_handle_new_user();
