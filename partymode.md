# CineClue — PRD v5.0
**Documento único y definitivo · PWA + Supabase self-hosted · Para generación de código con IA**
**Incluye: Core · Gamificación · Perfiles · Party Mode · Analytics · Admin Dashboard**

---

## 1. Visión del producto

CineClue es una plataforma web de trivia cinematográfica con identidad de usuario, progresión real, competencia social y modo multijugador en tiempo real. El jugador adivina películas a partir de 5 pistas progresivas reveladas una por una. Cuanto antes adivine, más puntos gana.

**Lo que lo diferencia:**
- Identidad cinematográfica propia: el perfil muestra qué tipo de cinéfilo sos, no solo cuántos puntos tenés
- Peli del día compartida: todos los usuarios juegan la misma película cada día (Wordle-style)
- ELO real: el ranking refleja habilidad, no volumen jugado
- Streaks y misiones: razón para volver todos los días
- Perfil público con URL compartible: la "huella cinematográfica" es motivo de orgullo y vector de viralidad
- Party Mode: multijugador en tiempo real para el living — tele como pantalla, teléfonos como controladores

**Plataforma:** PWA standalone en `cineclue.game`. Funciona en mobile y desktop. Instalable desde el browser.

**Backend:** Supabase self-hosted (PostgreSQL + Auth + Realtime + Edge Functions) en servidor propio.

**Target primario:** Cinéfilos hispanohablantes 18–35, usuarios de Instagram y Letterboxd.
**Target secundario:** Grupos de amigos en contexto social (Party Mode presencial).

---

## 2. Stack técnico

| Componente | Tecnología |
|---|---|
| Frontend | React (Vite + JSX + hooks) |
| Estilo | Tailwind CSS — mobile-first, max-width 600px |
| Routing | React Router v6 |
| Estado global | Zustand |
| Backend | Supabase self-hosted |
| Base de datos | PostgreSQL (vía Supabase) |
| Auth | Supabase Auth — Google OAuth + Apple OAuth |
| Realtime | Supabase Realtime (Party Mode + rankings en vivo) |
| Cron jobs | Supabase Edge Functions + pg_cron |
| Fonts | Google Fonts CDN (Playfair Display, DM Sans, DM Mono) |
| Share image | Canvas API (2D context) |
| Share nativo | Web Share API con fallback a overlay long-press |
| QR (Party) | Librería `qrcode` (generado en cliente) |
| Persistencia local | `localStorage` solo para nombres en Duelo local |
| Hosting | Self-hosted con Nginx (mismo servidor que Supabase) |
| PWA | `manifest.json` + `service-worker.js` |

---

## 3. Diseño visual

| Elemento | Valor |
|---|---|
| Background | `#0a0a0a` → `#111` (gradiente sutil) |
| Accent | Dorado `#d4af37` (gradiente: `#d4af37` → `#f5e6a3` → `#b8941f`) |
| Texto primario | `#ffffff` |
| Texto secundario | `rgba(255,255,255,0.6)` |
| Error | `#e53935` |
| Éxito | `#4caf50` |
| Títulos | Playfair Display (serif, italic para logo) |
| UI text | DM Sans (sans-serif) |
| Datos y puntos | DM Mono (monospace) |
| Grain overlay | SVG noise sobre toda la app, `pointer-events: none` |
| Glow radial | Radial gradient dorado en pantallas de juego |
| Animaciones | `fadeIn` (entradas), `shake` (error), `pop` (puntos ganados) |
| Layout core | `max-width: 600px`, centrado, `padding: 0 16px` |
| Layout Party tele | Fullscreen 16:9, sin max-width, optimizado para 1080p/4K |
| Border radius | 12px cards, 8px botones |
| Safe area | `env(safe-area-inset-*)` para notch/Dynamic Island |

---

## 4. Base de datos completa

### 4.1 Usuarios y perfiles

```sql
CREATE TABLE profiles (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id),
  username           TEXT UNIQUE NOT NULL,
  display_name       TEXT NOT NULL,
  avatar_url         TEXT,
  is_admin           BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  streak_current     INT DEFAULT 0,
  streak_best        INT DEFAULT 0,
  streak_last_played DATE,
  streak_shield      INT DEFAULT 0,
  elo                INT DEFAULT 1000,
  xp                 INT DEFAULT 0,
  level              INT DEFAULT 1,
  games_played       INT DEFAULT 0,
  games_completed    INT DEFAULT 0,
  total_score        INT DEFAULT 0
);
```

### 4.2 Películas

```sql
CREATE TABLE movies (
  id       SERIAL PRIMARY KEY,
  title    TEXT NOT NULL,
  alt      TEXT[] DEFAULT '{}',
  diff     TEXT CHECK (diff IN ('fácil','medio','difícil')),
  lb       TEXT NOT NULL,
  clues    JSONB NOT NULL,
  genres   TEXT[] DEFAULT '{}',
  country  TEXT,
  decade   INT,
  director TEXT,
  active   BOOLEAN DEFAULT TRUE
);
```

### 4.3 Peli del día

```sql
CREATE TABLE daily_movies (
  id         SERIAL PRIMARY KEY,
  movie_id   INT REFERENCES movies(id),
  date       DATE UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.4 Partidas (Solo y Daily)

```sql
CREATE TABLE games (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES profiles(id),
  mode          TEXT CHECK (mode IN ('solo','daily','duel_local')),
  played_at     TIMESTAMPTZ DEFAULT NOW(),
  completed     BOOLEAN DEFAULT FALSE,
  total_score   INT DEFAULT 0,
  max_possible  INT DEFAULT 25,
  movies_played JSONB NOT NULL,
  elo_before    INT,
  elo_after     INT,
  elo_delta     INT
);
```

### 4.5 Rankings y Hall of Fame

```sql
CREATE TABLE weekly_rankings (
  id           SERIAL PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id),
  week_start   DATE NOT NULL,
  score        INT DEFAULT 0,
  games_played INT DEFAULT 0,
  elo_at_end   INT,
  position     INT,
  UNIQUE(user_id, week_start)
);

CREATE TABLE hall_of_fame (
  id         SERIAL PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id),
  week_start DATE NOT NULL,
  position   INT NOT NULL,
  score      INT NOT NULL,
  elo        INT NOT NULL
);
```

### 4.6 Misiones y badges

```sql
CREATE TABLE missions (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  type        TEXT CHECK (type IN ('weekly','permanent','special')),
  condition   JSONB NOT NULL,
  reward_xp   INT DEFAULT 0,
  reward_badge TEXT,
  active      BOOLEAN DEFAULT TRUE
);

CREATE TABLE mission_progress (
  id           SERIAL PRIMARY KEY,
  user_id      UUID REFERENCES profiles(id),
  mission_id   INT REFERENCES missions(id),
  progress     INT DEFAULT 0,
  completed    BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  week_start   DATE,
  UNIQUE(user_id, mission_id, week_start)
);

CREATE TABLE badges (
  id          SERIAL PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  condition   JSONB NOT NULL
);

CREATE TABLE user_badges (
  id         SERIAL PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id),
  badge_slug TEXT REFERENCES badges(slug),
  earned_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_slug)
);
```

### 4.7 Estadísticas por categoría (huella cinematográfica)

```sql
CREATE TABLE user_category_stats (
  id             SERIAL PRIMARY KEY,
  user_id        UUID REFERENCES profiles(id),
  category_type  TEXT CHECK (category_type IN ('genre','country','decade')),
  category_value TEXT,
  guessed        INT DEFAULT 0,
  played         INT DEFAULT 0,
  UNIQUE(user_id, category_type, category_value)
);
```

### 4.8 Party Mode

```sql
CREATE TABLE party_rooms (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             CHAR(4) UNIQUE NOT NULL,
  host_user_id     UUID REFERENCES profiles(id),
  status           TEXT CHECK (status IN (
                     'waiting','starting','round_active','round_end','finished'
                   )) DEFAULT 'waiting',
  rounds_total     INT CHECK (rounds_total IN (5,10,15)) DEFAULT 10,
  current_round    INT DEFAULT 0,
  current_clue_index INT DEFAULT 0,
  round_started_at TIMESTAMPTZ,
  movies_queue     JSONB NOT NULL,
  current_movie_id INT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  expires_at       TIMESTAMPTZ DEFAULT NOW() + INTERVAL '3 hours'
);

CREATE TABLE party_players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID REFERENCES party_rooms(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '🎬',
  user_id      UUID REFERENCES profiles(id),
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  is_active    BOOLEAN DEFAULT TRUE,
  total_score  INT DEFAULT 0,
  UNIQUE(room_id, display_name)
);

CREATE TABLE party_answers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                 UUID REFERENCES party_rooms(id) ON DELETE CASCADE,
  player_id               UUID REFERENCES party_players(id) ON DELETE CASCADE,
  round_number            INT NOT NULL,
  movie_id                INT REFERENCES movies(id),
  answer_text             TEXT NOT NULL,
  is_correct              BOOLEAN NOT NULL,
  clue_index_when_answered INT NOT NULL,
  answered_at             TIMESTAMPTZ NOT NULL,
  response_time_ms        INT NOT NULL,
  points_earned           INT NOT NULL DEFAULT 0,
  UNIQUE(room_id, player_id, round_number)
);
```

### 4.9 Analytics

```sql
-- Tabla append-only. Nunca se actualiza, solo se inserta.
CREATE TABLE analytics_events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  session_id  UUID,
  user_id     UUID REFERENCES profiles(id),
  room_code   CHAR(4),
  properties  JSONB DEFAULT '{}'::jsonb
);
```

### 4.10 Índices

```sql
-- Core
CREATE INDEX idx_games_user_mode            ON games(user_id, mode);
CREATE INDEX idx_weekly_rankings_week        ON weekly_rankings(week_start, score DESC);
CREATE INDEX idx_daily_movies_date           ON daily_movies(date);
CREATE INDEX idx_mission_progress_user       ON mission_progress(user_id, completed);
CREATE INDEX idx_user_category_stats_user    ON user_category_stats(user_id, category_type);

-- Party
CREATE INDEX idx_party_rooms_code            ON party_rooms(code);
CREATE INDEX idx_party_rooms_status          ON party_rooms(status);
CREATE INDEX idx_party_players_room          ON party_players(room_id, is_active);
CREATE INDEX idx_party_answers_room_round    ON party_answers(room_id, round_number);

-- Analytics
CREATE INDEX idx_analytics_event_type        ON analytics_events(event_type, occurred_at DESC);
CREATE INDEX idx_analytics_user              ON analytics_events(user_id, occurred_at DESC);
CREATE INDEX idx_analytics_room              ON analytics_events(room_code, occurred_at DESC);
CREATE INDEX idx_analytics_occurred_at       ON analytics_events(occurred_at DESC);
```

---

## 5. Auth y onboarding

### 5.1 Flujo de registro

```
Landing → "Entrar con Google" / "Entrar con Apple"
       → Supabase OAuth redirect
       → Callback → check si profiles.id existe
         ├── Existe → Home
         └── No existe → Pantalla "Elegí tu username"
                       → Validar unicidad en tiempo real
                       → Crear profiles
                       → Home
```

### 5.2 Username

- 3–20 caracteres, solo letras/números/guiones/underscores
- Único en la plataforma
- Editable 1 vez por mes
- URL pública: `cineclue.game/u/{username}`

### 5.3 Sesión

- JWT Supabase con refresh automático
- Visitantes sin login pueden jugar en modo Solo local (sin guardar stats)
- Al terminar la primera partida como visitante: CTA "Guardá tu puntaje y construí tu perfil"

---

## 6. Modos de juego

### 6.1 Peli del día (modo principal)

| Parámetro | Valor |
|---|---|
| Películas | 1 por día, igual para todos |
| Programación | Cron job diario 00:00 UTC-3 |
| Rondas | 1 película, 5 pistas |
| Puntos máximos | 5 pts |
| ELO | Sí |
| Streak | Sí |
| Jugable | Una sola vez por día por usuario |

Post-juego exclusivo: distribución de aciertos de todos los usuarios (estilo Wordle) + countdown a la próxima peli.

### 6.2 Modo Solo

| Parámetro | Valor |
|---|---|
| Rondas | 5 |
| Selección | 2 fáciles + 2 medias + 1 difícil |
| Puntos máximos | 25 pts |
| ELO | Sí (menor peso que Daily) |
| Streak | No |
| Jugable | Ilimitadas veces por día |

### 6.3 Duelo 1v1 local

| Parámetro | Valor |
|---|---|
| Jugadores | 2, mismo dispositivo |
| Rondas | 5 |
| Timer | 12 segundos por pista |
| ELO | No |
| Auth requerida | Solo J1 (el anfitrión) |

**Mecánica de lockout:**
- Jugador falla → lockeado para esa pista; el otro puede buzzer
- Ambos fallan en la misma pista → auto-avance inmediato
- Timer agotado en las 5 pistas → 0 pts, se revela la respuesta

**Nombres en localStorage:** `cineclue_p1` y `cineclue_p2`. La revancha los mantiene.

### 6.4 Party Mode

Ver sección 14.

---

## 7. Sistema de pistas

| # | Tipo | Puntos | Descripción | Regla de contenido |
|---|---|---|---|---|
| 1 | Emojis | 5 pts | 5 emojis representando temas/escenas | No deletrear el título con emojis |
| 2 | Dato oscuro | 4 pts | Trivia de producción poco conocida | Sin título, director ni actores por nombre |
| 3 | Dato revelador | 3 pts | Trivia más identificable | Puede aludir al director/actores indirectamente |
| 4 | Frase icónica | 2 pts | Cita memorable, textual, entre comillas | — |
| 5 | Sinopsis | 1 pt | Resumen argumental sin spoilers duros | Nunca mencionar título, personajes, actores ni director |

Los puntos se asignan según la pista activa cuando el jugador acierta.

---

## 8. Sistema de respuestas

### 8.1 Normalización

```js
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}
```

### 8.2 Validación (match bidireccional)

```js
function check(input, movie) {
  const inp = normalize(input);
  if (inp.length < 3) return false;

  const title = normalize(movie.title);
  const alts = movie.alt.map(normalize);

  if (inp === title || alts.includes(inp)) return true;
  if (inp.includes(title) || title.includes(inp)) return true;
  if (alts.some(alt => inp.includes(alt) || alt.includes(inp))) return true;

  return false;
}
```

### 8.3 Feedback por estado

| Estado | Visual |
|---|---|
| Correcto | Borde dorado, título revelado, `"+X pts"` con animación pop |
| Incorrecto | Shake en el input, borde rojo |
| Pasar | Título revelado, badge "No la conocías" |

---

## 9. Sistema de ELO

### 9.1 Cálculo

```js
function calculateELO(currentELO, gamesPlayed, score, maxScore, movieDifficulties) {
  const K = gamesPlayed < 10 ? 40 : gamesPlayed < 30 ? 20 : 10;
  const performance = score / maxScore;
  const expected = 0.60;
  const hardCount = movieDifficulties.filter(d => d === 'difícil').length;
  const easyCount = movieDifficulties.filter(d => d === 'fácil').length;
  const diffMultiplier = 1 + (hardCount * 0.15) - (easyCount * 0.05);
  const delta = Math.round(K * (performance - expected) * diffMultiplier);
  return Math.max(100, currentELO + delta);
}
```

### 9.2 Rangos

| Rango | ELO | Título |
|---|---|---|
| 🌱 | < 800 | Espectador |
| 🎟 | 800–999 | Aficionado |
| 🎬 | 1000–1199 | Cinéfilo |
| 🏆 | 1200–1399 | Crítico |
| 🎭 | 1400–1599 | Curador |
| ⭐ | ≥ 1600 | Maestro del Cine |

---

## 10. Streaks

### 10.1 Reglas

- Solo la Peli del día alimenta el streak
- Si no jugás la peli del día, el streak se resetea al día siguiente
- Usuarios con streak ≥ 7 tienen 1 escudo de protección (se usa automáticamente al saltear un día)

### 10.2 Hitos

| Días | Recompensa |
|---|---|
| 3 | +50 XP |
| 7 | Badge "Semana completa" + 150 XP |
| 14 | Badge "Quincena" + 300 XP |
| 30 | Badge "Mes dedicado" + 500 XP + escudo extra |
| 100 | Badge "Centenario" + 2000 XP |

### 10.3 Función SQL

```sql
CREATE OR REPLACE FUNCTION update_streak(p_user_id UUID)
RETURNS void AS $$
DECLARE
  last_played DATE;
  today DATE := CURRENT_DATE;
BEGIN
  SELECT streak_last_played INTO last_played FROM profiles WHERE id = p_user_id;
  IF last_played = today - 1 OR last_played = today THEN
    UPDATE profiles SET
      streak_current = streak_current + 1,
      streak_best = GREATEST(streak_best, streak_current + 1),
      streak_last_played = today
    WHERE id = p_user_id;
  ELSE
    UPDATE profiles SET
      streak_current = 1,
      streak_last_played = today
    WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## 11. XP y niveles

### 11.1 Fuentes de XP

| Acción | XP |
|---|---|
| Completar peli del día | +20 base |
| Adivinar en pista 1 | +30 bonus |
| Adivinar en pista 2 | +20 bonus |
| Adivinar una difícil | +15 bonus |
| Completar partida Solo | +10 |
| Completar partida Party (logueado) | +50 |
| Completar misión semanal | +50–150 |
| Nuevo badge | +100 |
| Streak milestone | Variable |

### 11.2 Curva de niveles

XP para nivel N = `100 * N^1.5`. El nivel nunca se resetea.

| Nivel | XP requerido |
|---|---|
| 1 | 0 |
| 5 | 1.118 |
| 10 | 3.162 |
| 20 | 8.944 |
| 30 | 16.431 |
| 50 | 35.355 |

---

## 12. Misiones

### 12.1 Semanales (reset cada lunes)

| Misión | Condición | Recompensa |
|---|---|---|
| Maratón | 5 partidas esta semana | +100 XP |
| Ojo clínico | 3 películas difíciles adivinadas | +150 XP |
| Cinéfilo consistente | Peli del día 5 días seguidos | +200 XP + escudo |
| Descubridor | 5 clicks a Letterboxd | +80 XP |
| Velocista | 2 películas adivinadas en pista 1 | +120 XP |

### 12.2 Permanentes (una sola vez)

| Misión | Condición | Recompensa |
|---|---|---|
| Primera sangre | Primera partida ganada | +50 XP |
| Racha inicial | Streak de 3 días | +100 XP |
| Cinéfilo de élite | 20/25 en modo Solo | Badge + 200 XP |
| Un mes de cine | Streak 30 días | Badge + 500 XP |
| Coleccionista | 50 películas únicas adivinadas | Badge + 300 XP |

---

## 13. Perfiles

### 13.1 Huella cinematográfica

Generada automáticamente a partir del historial de partidas:

- **Especialidades:** categorías con ≥70% de aciertos en ≥5 películas jugadas
- **Debilidades:** categorías con <30% de aciertos en ≥5 películas jugadas
- **Mapa de géneros:** radar chart con los 6 géneros principales y % de acierto
- **Estadísticas globales:** partidas, películas únicas adivinadas, mejor racha, ELO

```js
function generateCinematicIdentity(stats) {
  const specialties = getSpecialties(stats);  // ['cine coreano', 'animación']
  const weaknesses  = getWeaknesses(stats);   // ['cine iraní']
  const favoriteEra = getFavoriteDecade(stats); // '1990'
  // Output: "Especialista en cine coreano y animación. Tu década fuerte es los 90."
}
```

### 13.2 Perfil público (`cineclue.game/u/{username}`)

**Visible para todos sin login:**
- Display name, username, avatar, ELO y rango, nivel y barra de XP
- Huella cinematográfica (especialidades + radar chart)
- Badges ganados con fecha
- Streak actual y mejor racha
- Estadísticas globales

**No visible públicamente:** historial de partidas individuales, misiones en progreso

**CTA para visitantes:** "¿Cuál es tu huella cinematográfica? Jugá gratis"

### 13.3 Perfil propio (`/profile`)

Todo lo del perfil público más:
- Historial de partidas recientes (últimas 10)
- Progreso de misiones permanentes
- Nivel y barra de XP detallada
- Botón "Editar perfil" → `/profile/edit`

---

## 14. Party Mode

### 14.1 Visión

CineClue Party es el modo multijugador en tiempo real. El host abre la sala desde la tele, los jugadores se conectan escaneando un QR o ingresando un código de 4 letras, y la partida corre sincronizada para todos.

**Diferencia con Kahoot:** en Party Mode escribís el nombre de la película — misma mecánica de pistas progresivas, pero competitiva y en tiempo real. La velocidad importa.

**Auth:** el host puede estar logueado o no. Los jugadores son siempre anónimos en la sala.

**Integración con el core:**
- No afecta ELO ni streak
- Suma 50 XP a usuarios logueados al completar
- Actualiza `user_category_stats` para usuarios logueados (alimenta la huella)
- Jugadores anónimos ven CTA al terminar: "¿Querés guardar tus stats? Creá tu perfil"

### 14.2 Sistema de puntuación Party

```js
function calculatePoints(clueIndex, responseTimeMs, clueWindowMs) {
  const basePoints  = [500, 400, 300, 200, 100][clueIndex];
  const timeRatio   = 1 - (responseTimeMs / clueWindowMs);
  const speedBonus  = Math.round(500 * Math.max(0, timeRatio));
  return basePoints + speedBonus;
}
// Puntos máximos por ronda: ~1000 pts (pista 1, velocidad máxima)
```

**Todos los que responden correctamente ganan puntos. Responder más rápido da más.**

**No hay lockout en Party** — un jugador puede reintentar dentro de la misma pista hasta que cambie el timer.

### 14.3 Timer por pista (autoritativo en servidor)

| Pista | Tiempo |
|---|---|
| 1 — Emojis | 30 segundos |
| 2 — Dato oscuro | 25 segundos |
| 3 — Dato revelador | 20 segundos |
| 4 — Frase icónica | 15 segundos |
| 5 — Sinopsis | 15 segundos |

El servidor registra `round_started_at`. Los clientes calculan el tiempo restante desde ese timestamp. Esto garantiza equidad independientemente de la latencia de cada dispositivo.

### 14.4 Generación del código de sala

```js
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Sin I, O
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
```

### 14.5 Flujo del host (tele)

```
/party → "Crear sala"
  → Edge Function genera código + crea party_room
  → /party/room/{CODE}/host

[waiting]
  → QR grande + código de 4 letras
  → Lista de jugadores entrando (Realtime)
  → Selector de rondas: 5 / 10 / 15 (default: 10)
  → Botón "Empezar" (habilitado con ≥2 jugadores)

[starting]
  → Countdown 3... 2... 1...

[round_active]
  → Ronda X/Y + timer bar animada
  → Pistas apiladas (nuevas con fadeIn, anteriores con opacidad reducida)
  → "X jugadores respondieron" (Realtime)

[round_end] — 8 segundos automático o manual
  → Título revelado (grande, dorado) + badge dificultad + link Letterboxd
  → Podio de ronda: top 3 con puntos ganados
  → Ranking general completo

[finished]
  → Confetti + podio final 1°/2°/3°
  → Tabla completa de resultados
  → "Nueva partida" (mismos jugadores, películas nuevas) / "Salir"
```

### 14.6 Flujo del jugador (teléfono)

```
cineclue.game/party → "Unirme a una sala"
  → Input código (pre-filled si llegó por QR)
  → Input nombre (máx 16 chars)
  → Selector avatar emoji: 🎬 🍿 🎭 🎞 🎥 👁 🏆 ⭐
  → "Entrar"

[waiting]   → "Esperando que el host empiece..." + lista de jugadores
[starting]  → Countdown animado
[round_active — sin responder]
  → Ronda X/Y + pistas sincronizadas + input + timer bar + posición actual
[round_active — correcto]
  → "¡Correcto! 🎉" + puntos ganados + posición actualizada + "Esperando..."
[round_active — incorrecto]
  → "Incorrecto 😬" + puede reintentar
[round_end]
  → Puntos ganados en ronda + cambio de posición
[finished]
  → Resultado final + CTA registro si es anónimo
```

### 14.7 Layout tele (fullscreen 16:9)

```
┌─────────────────────────────────────────────────────────────────┐
│ CineClue Party          Ronda 3/10          [Timer bar ━━━━━━░░] │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │  🏆 RANKING                  │
│  PISTA 1: 🎭🌧️🎶💔🗼            │                              │
│                                  │  1. Mati       4.200 pts     │
│  PISTA 2: Esta película se       │  2. Caro       3.800 pts     │
│  rodó en 43 días con un          │  3. Diego      3.550 pts     │
│  presupuesto récord para         │  4. Juli       2.900 pts     │
│  la época en Francia.            │  5. Santi      2.100 pts     │
│                                  │                              │
│  ✓ 4 / 8 respondieron           │  código: XKCD                │
└──────────────────────────────────┴──────────────────────────────┘
```

Panel izquierdo (70%): pistas + contador de respuestas. Panel derecho (30%): ranking Realtime con animaciones de posición. Código de sala siempre visible (footer derecho) para que puedan unirse tarde.

### 14.8 Layout teléfono (max-width 480px)

```
┌──────────────────┐
│ Ronda 3/10  ⏱ 18s│
├──────────────────┤
│ 🎭🌧️🎶💔🗼       │
│ Esta película se │
│ rodó en 43 días..│
├──────────────────┤
│ ¿Qué película es?│
│ [______________] │
│   [ Responder ]  │
├──────────────────┤
│ Tu posición: #3  │
│ 3.550 pts        │
└──────────────────┘
```

### 14.9 Sincronización Realtime

Canal: `party:{roomCode}`

**Servidor → clientes:**
```js
{ event: 'room_status',    payload: { status, currentRound, clueIndex } }
{ event: 'clue_revealed',  payload: { clueIndex, clue: { type, text } } }
{ event: 'player_answered',payload: { playerId, displayName } }
// isCorrect se omite para no revelar a los demás
{ event: 'ranking_update', payload: { rankings: [{playerId, displayName, avatarEmoji, totalScore, position}] } }
{ event: 'round_end',      payload: { movieId, title, correctPlayers: [{displayName, pointsEarned}] } }
{ event: 'game_finished',  payload: { finalRankings } }
```

**Clientes → servidor:**
```js
POST /api/party/rooms/{code}/join    { displayName, avatarEmoji, userId? }
POST /api/party/rooms/{code}/start   { rounds: 5|10|15 }
POST /api/party/rooms/{code}/answer  { playerId, answer, roundNumber, clueIndex, responseTimeMs }
POST /api/party/rooms/{code}/next-round  // solo el host, avance manual
```

### 14.10 Edge Functions Party

**`party-create-room`**
```js
async function createRoom({ rounds, hostUserId }) {
  const code   = await generateUniqueCode();
  const movies = await selectPartyMovies(rounds);
  await supabase.from('party_rooms').insert({
    code, host_user_id: hostUserId ?? null,
    rounds_total: rounds,
    movies_queue: movies.map(m => m.id),
    current_movie_id: movies[0].id,
    status: 'waiting',
    expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000)
  });
  return { code };
}
```

**`party-timer`** (autoritativo)
```js
async function advanceClue(roomCode) {
  const room = await getRoom(roomCode);
  if (room.status !== 'round_active') return;
  const elapsed     = Date.now() - new Date(room.round_started_at).getTime();
  const clueWindow  = [30000, 25000, 20000, 15000, 15000][room.current_clue_index];
  if (elapsed >= clueWindow) {
    room.current_clue_index < 4 ? await nextClue(roomCode) : await endRound(roomCode);
  }
}
```

**`party-validate-answer`**
```js
async function validateAnswer({ roomCode, playerId, answer, roundNumber, clueIndex, responseTimeMs }) {
  const room = await getRoom(roomCode);
  if (room.status !== 'round_active')      return { error: 'round_not_active' };
  if (room.current_round !== roundNumber)  return { error: 'wrong_round' };
  const existing = await getAnswer(roomCode, playerId, roundNumber);
  if (existing)                            return { error: 'already_answered' };

  const movie      = await getMovie(room.current_movie_id);
  const isCorrect  = check(answer, movie);
  const clueWindowMs = [30000, 25000, 20000, 15000, 15000][clueIndex];
  const points     = isCorrect ? calculatePoints(clueIndex, responseTimeMs, clueWindowMs) : 0;

  await supabase.from('party_answers').insert({
    room_id: room.id, player_id: playerId, round_number: roundNumber,
    movie_id: movie.id, answer_text: answer, is_correct: isCorrect,
    clue_index_when_answered: clueIndex, answered_at: new Date(),
    response_time_ms: responseTimeMs, points_earned: points
  });

  if (isCorrect) {
    await supabase.from('party_players')
      .update({ total_score: supabase.raw(`total_score + ${points}`) })
      .eq('id', playerId);
  }

  await broadcastRankingUpdate(roomCode);
  const allAnswered = await checkAllAnswered(roomCode, roundNumber);
  if (allAnswered) await endRound(roomCode);

  return { isCorrect, pointsEarned: points };
}
```

### 14.11 Selección de películas Party

```js
function selectPartyMovies(rounds) {
  const dist = {
     5: { fácil: 2, medio: 2, difícil: 1 },
    10: { fácil: 3, medio: 5, difícil: 2 },
    15: { fácil: 4, medio: 8, difícil: 3 }
  }[rounds];
  const easy   = shuffle(MOVIES.filter(m => m.diff === 'fácil')).slice(0, dist.fácil);
  const medium = shuffle(MOVIES.filter(m => m.diff === 'medio')).slice(0, dist.medio);
  const hard   = shuffle(MOVIES.filter(m => m.diff === 'difícil')).slice(0, dist.difícil);
  return interleave(easy, medium, hard); // No difíciles al principio ni al final
}
```

### 14.12 Edge cases Party

| Situación | Comportamiento |
|---|---|
| Jugador se desconecta | `is_active = false`. No bloquea el avance. Aparece en gris en el ranking |
| Jugador se reconecta | Vuelve a `/party/room/{code}/player`, recupera estado |
| Host cierra la tele | Sala queda en `round_active`. Jugadores ven "Esperando al host..." |
| Sala expirada (3hs) | Eliminada por cron. Jugadores ven "Esta sala ya no existe" |
| Alguien entra a sala `finished` | "Esta partida ya terminó. Pedile al host que inicie una nueva" |
| Respuesta enviada al cambiar pista | Servidor valida contra el `clueIndex` del cliente. Si ya cambió, se descarta |
| Código inexistente | "Sala no encontrada. Revisá el código" |
| Nombre duplicado en sala | "Ese nombre ya está en uso en esta sala" |

### 14.13 Limpieza automática

```sql
SELECT cron.schedule('cleanup-party-rooms', '0 * * * *',
  'DELETE FROM party_rooms WHERE expires_at < NOW()'
);
-- ON DELETE CASCADE elimina party_players y party_answers automáticamente
```

---

## 15. Analytics

### 15.1 Filosofía

Sin herramientas externas. Todo el tracking vive en Supabase. Los eventos se escriben en `analytics_events` (append-only). Las métricas se calculan con vistas SQL materializadas que se refrescan cada hora con pg_cron.

### 15.2 Cliente de tracking (frontend)

```js
// analytics.js — fire-and-forget, no bloquea la UI
const sessionId = getOrCreateSessionId(); // localStorage: 'cc_session'

export async function track(eventType, properties = {}) {
  supabase.from('analytics_events').insert({
    event_type: eventType,
    session_id: sessionId,
    user_id: getCurrentUserId() ?? null,
    room_code: getCurrentRoomCode() ?? null,
    properties
  }).then(() => {}).catch(() => {});
}
```

### 15.3 Catálogo de eventos

**Sesión:**

| event_type | Cuándo | properties |
|---|---|---|
| `session_start` | Al abrir la app | `{ platform, is_pwa, referrer }` |
| `user_registered` | Al completar onboarding | `{ method: 'google'\|'apple' }` |
| `user_login` | Al iniciar sesión | `{ method }` |

**Core (Solo + Daily):**

| event_type | Cuándo | properties |
|---|---|---|
| `game_started` | Al empezar partida | `{ mode }` |
| `game_completed` | Al llegar a Game Over | `{ mode, score, max_score }` |
| `game_abandoned` | Cierra antes de Game Over | `{ mode, round_reached }` |
| `answer_correct` | Respuesta correcta | `{ mode, movie_id, clue_index, diff }` |
| `answer_incorrect` | Respuesta incorrecta | `{ mode, movie_id, clue_index }` |
| `round_passed` | Al pasar ronda | `{ mode, movie_id }` |
| `letterboxd_clicked` | Click en link LB | `{ mode, movie_id, context }` |
| `share_tapped` | Toca compartir | `{ mode }` |
| `share_completed` | Imagen guardada | `{ method: 'web_share'\|'long_press' }` |

**Party:**

| event_type | Cuándo | properties |
|---|---|---|
| `party_room_created` | Host crea sala | `{ rounds_total, host_is_logged_in }` |
| `party_player_joined` | Jugador entra | `{ is_anonymous, player_count_at_join }` |
| `party_game_started` | Host presiona Empezar | `{ rounds_total, player_count }` |
| `party_round_completed` | Termina una ronda | `{ round_number, correct_count, total_players, movie_id, diff }` |
| `party_game_completed` | Partida terminada | `{ rounds_played, player_count, duration_ms }` |
| `party_game_abandoned` | Sala expiró sin terminar | `{ rounds_played, player_count }` |
| `party_rematch` | Host inicia revancha | `{ rounds_total, player_count }` |
| `party_anon_cta_tapped` | Anónimo toca "Creá tu perfil" | `{}` |
| `party_anon_converted` | Anónimo se registra post-party | `{ time_since_cta_ms }` |

### 15.4 Vistas materializadas

**DAU / MAU:**
```sql
CREATE MATERIALIZED VIEW mv_dau_mau AS
WITH daily AS (
  SELECT DATE(occurred_at) AS day,
    COUNT(DISTINCT COALESCE(user_id::text, session_id::text)) AS dau
  FROM analytics_events WHERE event_type = 'session_start' GROUP BY 1
),
monthly AS (
  SELECT DATE_TRUNC('month', occurred_at) AS month,
    COUNT(DISTINCT COALESCE(user_id::text, session_id::text)) AS mau
  FROM analytics_events WHERE event_type = 'session_start' GROUP BY 1
)
SELECT d.day, d.dau, m.mau,
  ROUND(d.dau::numeric / NULLIF(m.mau, 0) * 100, 1) AS dau_mau_ratio
FROM daily d
JOIN monthly m ON DATE_TRUNC('month', d.day) = m.month
ORDER BY d.day DESC;
```

**Partidas por día:**
```sql
CREATE MATERIALIZED VIEW mv_games_over_time AS
SELECT
  DATE(occurred_at) AS day,
  DATE_TRUNC('week', occurred_at)::date AS week,
  COUNT(*) FILTER (WHERE event_type = 'game_completed')        AS games_completed,
  COUNT(*) FILTER (WHERE event_type = 'game_started')          AS games_started,
  COUNT(*) FILTER (WHERE event_type = 'party_game_completed')  AS party_completed,
  COUNT(*) FILTER (WHERE event_type = 'party_game_started')    AS party_started,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'game_completed')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_type = 'game_started'), 0) * 100, 1
  ) AS completion_rate_pct
FROM analytics_events GROUP BY 1, 2 ORDER BY 1 DESC;
```

**Métricas Party:**
```sql
CREATE MATERIALIZED VIEW mv_party_metrics AS
SELECT
  DATE(occurred_at) AS day,
  COUNT(*) FILTER (WHERE event_type = 'party_room_created')     AS rooms_created,
  COUNT(*) FILTER (WHERE event_type = 'party_game_completed')   AS rooms_completed,
  COUNT(*) FILTER (WHERE event_type = 'party_game_abandoned')   AS rooms_abandoned,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'party_game_completed')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_type = 'party_room_created'), 0) * 100, 1
  ) AS completion_rate_pct,
  ROUND(AVG((properties->>'player_count')::numeric)
    FILTER (WHERE event_type = 'party_game_started'), 1)        AS avg_players_per_room,
  MAX((properties->>'player_count')::numeric)
    FILTER (WHERE event_type = 'party_game_started')            AS max_players_in_room,
  COUNT(*) FILTER (WHERE event_type = 'party_game_started'
    AND (properties->>'rounds_total')::int = 5)                 AS rooms_5_rounds,
  COUNT(*) FILTER (WHERE event_type = 'party_game_started'
    AND (properties->>'rounds_total')::int = 10)                AS rooms_10_rounds,
  COUNT(*) FILTER (WHERE event_type = 'party_game_started'
    AND (properties->>'rounds_total')::int = 15)                AS rooms_15_rounds,
  COUNT(*) FILTER (WHERE event_type = 'party_anon_cta_tapped')  AS anon_cta_taps,
  COUNT(*) FILTER (WHERE event_type = 'party_anon_converted')   AS anon_converted,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'party_anon_converted')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_type = 'party_anon_cta_tapped'), 0) * 100, 1
  ) AS anon_conversion_rate_pct,
  COUNT(DISTINCT session_id)
    FILTER (WHERE event_type = 'party_room_created')            AS unique_hosts,
  COUNT(*) FILTER (WHERE event_type = 'party_rematch')          AS rematches
FROM analytics_events GROUP BY 1 ORDER BY 1 DESC;
```

**Películas más y menos adivinadas:**
```sql
CREATE MATERIALIZED VIEW mv_movie_difficulty AS
SELECT
  (properties->>'movie_id')::int                                 AS movie_id,
  m.title, m.diff,
  COUNT(*) FILTER (WHERE event_type = 'answer_correct')          AS times_guessed,
  COUNT(*) FILTER (WHERE event_type IN ('round_passed','answer_incorrect')) AS times_failed,
  COUNT(*)                                                        AS times_shown,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'answer_correct')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  )                                                               AS guess_rate_pct,
  ROUND(AVG((properties->>'clue_index')::numeric)
    FILTER (WHERE event_type = 'answer_correct'), 2)             AS avg_clue_when_guessed
FROM analytics_events e
JOIN movies m ON m.id = (e.properties->>'movie_id')::int
WHERE event_type IN ('answer_correct','answer_incorrect','round_passed')
GROUP BY 1, 2, 3
ORDER BY guess_rate_pct ASC;
```

**Refresh automático cada hora:**
```sql
SELECT cron.schedule('refresh-analytics-views', '0 * * * *', $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dau_mau;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_games_over_time;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_party_metrics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_movie_difficulty;
$$);
```

---

## 16. Admin Dashboard (`/admin`)

### 16.1 Acceso

Solo usuarios con `profiles.is_admin = TRUE`. El frontend verifica al cargar `/admin` y redirige a `/home` si no aplica. Las Edge Functions del dashboard usan `service_role` key, bypassing RLS.

### 16.2 Estructura (4 tabs)

```
/admin
  ├── Visión general
  ├── Party Mode
  ├── Películas
  └── Usuarios
```

### 16.3 Tab: Visión general

**Cards:**
- DAU hoy / MAU mes actual / ratio DAU/MAU
- Partidas completadas hoy / completion rate 7 días / tasa de share 7 días

**Gráficos:**
- Línea: DAU últimos 30 días
- Línea: partidas por día separadas por modo (Solo / Daily / Party)
- Barras: partidas por día de la semana (para ver patrones de uso)

### 16.4 Tab: Party Mode

**Cards:**
- Salas creadas hoy / esta semana
- Completion rate (completadas vs. abandonadas)
- Avg. jugadores por sala / máx. en una sala
- Distribución de rondas 5/10/15 (donut chart)
- % hosts que crearon más de 1 sala
- Conversión anónimo → registro

**Tabla de salas recientes:**

| Código | Fecha | Jugadores | Rondas | Estado | Duración |
|---|---|---|---|---|---|
| XKCD | hoy 21:30 | 8 | 10 | Completada | 34 min |
| MKLP | hoy 20:15 | 4 | 5 | Abandonada | 8 min |

### 16.5 Tab: Películas

Tabla completa ordenable por cualquier columna:

| Película | Dificultad | Veces mostrada | % adivinada | Pista promedio | Clicks LB |
|---|---|---|---|---|---|
| Toy Story | Fácil | 1.450 | 95% | 1.4 | 89 |
| Stalker | Difícil | 890 | 12% | 4.8 | 567 |

- Filtrable por dificultad
- Películas con `guess_rate_pct > 95%` marcadas en amarillo (demasiado fáciles)
- Películas con `guess_rate_pct < 15%` marcadas en rojo (candidatas a reclasificar)
- Botón "Exportar CSV"

### 16.6 Tab: Usuarios

**Cards:**
- Total usuarios registrados / nuevos hoy / nuevos esta semana
- Usuarios con streak activo ≥1 día / ≥7 días
- ELO promedio global

**Tabla: usuarios más activos (últimos 30 días)**

| Usuario | Partidas | Streak actual | ELO | Nivel |
|---|---|---|---|---|
| @mati | 84 | 🔥 21 días | 1.420 | 18 |

### 16.7 API del dashboard

```
GET /api/admin/overview
GET /api/admin/dau-chart?days=30
GET /api/admin/party?from=&to=
GET /api/admin/party/rooms?limit=50&offset=0
GET /api/admin/movies?sort=guess_rate&order=asc
GET /api/admin/movies/export   → CSV
GET /api/admin/users/overview
GET /api/admin/users/top?limit=20
```

Todas requieren `is_admin = true`. Responden con los datos de las vistas materializadas correspondientes.

---

## 17. Row Level Security (completo)

```sql
-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Perfiles públicos"         ON profiles FOR SELECT USING (true);
CREATE POLICY "Solo dueño edita perfil"   ON profiles FOR UPDATE USING (auth.uid() = id);

-- games
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver propias partidas"      ON games FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Crear propias partidas"    ON games FOR INSERT WITH CHECK (auth.uid() = user_id);

-- weekly_rankings
ALTER TABLE weekly_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rankings públicos"         ON weekly_rankings FOR SELECT USING (true);

-- mission_progress
ALTER TABLE mission_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver propio progreso"       ON mission_progress FOR SELECT USING (auth.uid() = user_id);

-- daily_movies
ALTER TABLE daily_movies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Daily movies públicas"     ON daily_movies FOR SELECT USING (true);

-- party_rooms
ALTER TABLE party_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rooms públicas"            ON party_rooms FOR SELECT USING (true);
-- Escritura solo por service_role (Edge Functions)

-- party_players
ALTER TABLE party_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver jugadores de sala"     ON party_players FOR SELECT USING (true);

-- party_answers
ALTER TABLE party_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver propias respuestas"    ON party_answers FOR SELECT
  USING (player_id IN (SELECT id FROM party_players WHERE id = player_id));

-- analytics_events
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo admins leen analytics" ON analytics_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE));
-- Escritura solo por service_role (Edge Functions)
```

---

## 18. Cron jobs y automatización

### 18.1 Peli del día (diario 00:00 UTC-3)

```js
async function scheduleDailyMovie() {
  const recentIds   = await getRecentDailyMovieIds(108);
  const candidates  = await getMoviesExcluding(recentIds);
  const tomorrow    = getNextDate();
  const cycleIndex  = getDaysSinceEpoch(tomorrow) % 3;
  const targetDiff  = ['fácil', 'medio', 'difícil'][cycleIndex];
  const movie       = randomFrom(candidates.filter(m => m.diff === targetDiff));
  await supabase.from('daily_movies').insert({ movie_id: movie.id, date: tomorrow });
}
```
```sql
SELECT cron.schedule('schedule-daily-movie', '0 3 * * *', 'SELECT http_post(...)');
-- 03:00 UTC = 00:00 UTC-3
```

### 18.2 Reset ranking semanal (lunes 00:00 UTC-3)

```js
async function resetWeeklyRanking() {
  const weekStart = getLastMonday();
  const rankings  = await getWeeklyRankings(weekStart);
  await saveHallOfFame(rankings.slice(0, 3), weekStart);
  await updateFinalPositions(rankings, weekStart);
  // Las nuevas entradas se crean on-demand cuando el usuario juega
}
```

### 18.3 Reset misiones semanales (lunes, junto con ranking)

Marca las misiones semanales de la semana anterior como expiradas. Las permanentes no se tocan.

### 18.4 Limpieza de salas Party (cada hora)

```sql
SELECT cron.schedule('cleanup-party-rooms', '0 * * * *',
  'DELETE FROM party_rooms WHERE expires_at < NOW()'
);
```

### 18.5 Refresh de vistas de analytics (cada hora)

Ver sección 15.4.

---

## 19. Flujo de partida completa (backend)

```
POST /api/games/complete
  { mode: "daily"|"solo", movies_played: [...], total_score: N }
  ↓
Edge Function: game-complete
  1. Validar integridad (peli del día: no jugada hoy, etc.)
  2. Insertar en games
  3. Calcular delta ELO → actualizar profiles.elo
  4. Calcular XP → actualizar profiles.xp y profiles.level
  5. Si es daily: update_streak()
  6. Actualizar user_category_stats (género, país, década)
  7. Upsert weekly_rankings semana actual
  8. check_missions(user_id, game_data)
  9. Evaluar badges nuevos
  10. Return: { elo_delta, xp_gained, new_badges, missions_completed, new_level }
```

---

## 20. Inventario de pantallas y rutas

### 20.1 Públicas (sin auth)

| Ruta | Descripción |
|---|---|
| `/` | Landing: propuesta de valor, CTA registro, preview peli del día |
| `/u/{username}` | Perfil público |
| `/ranking` | Ranking semanal (lectura) |
| `/party` | Landing Party Mode |
| `/party/join` | Input código + nombre + avatar |
| `/party/room/{code}/player` | Controlador del jugador |

### 20.2 Auth

| Ruta | Descripción |
|---|---|
| `/auth` | Login Google / Apple |
| `/onboarding` | Elegir username (solo primera vez) |

### 20.3 App (requiere auth)

| Ruta | Descripción |
|---|---|
| `/home` | Home: modos, streak, peli del día CTA, mini-ranking |
| `/daily` | Peli del día |
| `/solo` | Modo Solo |
| `/duel` | Duelo 1v1 local |
| `/ranking` | Ranking semanal interactivo |
| `/missions` | Misiones activas y completadas |
| `/profile` | Perfil propio |
| `/profile/edit` | Editar display name y username |
| `/party/room/{code}/host` | Vista de tele (Party) |
| `/admin` | Dashboard admin |

---

## 21. Compartir (Stories)

### 21.1 Flujo

```js
async function share(blob) {
  const file = new File([blob], 'cineclue.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'CineClue' });
    return;
  }
  showLongPressOverlay(blob); // fallback
}
```

### 21.2 Card de resultado (Canvas 1080×1920)

```
[Logo CineClue]
[Rango ELO del usuario]

PELI DEL DÍA / MODO SOLO
[Badge de nivel + texto]
X / 25 pts    +Y ELO

[Tabla: 5 películas, dificultad, puntos]

¿Cuánto sabés de cine? Probá vos
cineclue.game
```

**Sin emojis en `fillText()`** — solo tipografía y símbolos unicode simples. Fuentes cargadas con `FontFace` antes de renderizar. `canvas.toBlob('image/png')` para obtener el archivo.

### 21.3 Card de perfil

Desde el perfil público: avatar, username, rango ELO, especialidades, top 3 badges, stats clave. CTA: "¿Cuál es tu cine? cineclue.game".

---

## 22. Base de datos de películas

### 22.1 TypeScript

```ts
interface Clue {
  type: "emojis" | "dato_oscuro" | "dato_revelador" | "frase" | "sinopsis";
  text: string;
  points: 5 | 4 | 3 | 2 | 1;
}
interface Movie {
  id: number;
  title: string;
  alt: string[];
  diff: "fácil" | "medio" | "difícil";
  lb: string;
  genres: string[];
  country: string;
  decade: number;
  director: string;
  clues: [Clue, Clue, Clue, Clue, Clue];
}
```

### 22.2 Distribución

| Dificultad | Cantidad | Criterio |
|---|---|---|
| Fácil | 36 (33%) | Blockbusters, animación mainstream, frases universales |
| Medio | 46 (43%) | Cine de autor accesible, thrillers, dramas premiados |
| Difícil | 26 (24%) | Cine de autor internacional, clásicos de festival, cine latinoamericano de nicho |

### 22.3 Selección balanceada por partida (Solo)

```js
function selectMovies(pool) {
  const easy   = shuffle(pool.filter(m => m.diff === 'fácil')).slice(0, 2);
  const medium = shuffle(pool.filter(m => m.diff === 'medio')).slice(0, 2);
  const hard   = shuffle(pool.filter(m => m.diff === 'difícil')).slice(0, 1);
  return shuffle([...easy, ...medium, ...hard]);
}
```

### 22.4 Cobertura geográfica

Norteamérica (Hollywood, Pixar, Disney, DreamWorks), Argentina (Relatos Salvajes, El Secreto de Sus Ojos, La Ciénaga, Zama, Nueve Reinas), México (Coco, Amores Perros, Roma, El Topo), Brasil (Ciudad de Dios), Corea del Sur (Parásitos, Oldboy, Memories of Murder), Japón (Rashomon), Taiwán (Yi Yi), Hong Kong (In the Mood for Love, Chungking Express), Irán (El Sabor de las Cerezas), Europa (Amélie, Trainspotting, Persona, Stalker, La Vida es Bella, Ida, El Séptimo Sello).

---

## 23. Badges de nivel (partidas Solo)

| Badge | Condición |
|---|---|
| 🏆 Cinéfilo de élite | ≥ 20 pts (≥80%) |
| 🎬 Gran conocedor | ≥ 15 pts (≥60%) |
| 👁 Buen ojo | ≥ 10 pts (≥40%) |
| 🍿 Espectador casual | ≥ 5 pts (≥20%) |
| 🎟 Recién arrancás | < 5 pts |

---

## 24. Integración Letterboxd

- URL: `https://letterboxd.com/film/{lb}/`
- Copy: "🎬 Ver en Letterboxd" (si adivinó) / "🎬 Descubrila en Letterboxd" (si no)
- `target="_blank"` + `rel="noopener noreferrer"`
- Aparece en: resultado de ronda (todos los modos), Game Over, perfil
- Click suma progreso a la misión "Descubridor"

---

## 25. PWA

```json
{
  "name": "CineClue",
  "short_name": "CineClue",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png",          "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png",          "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

`service-worker.js`: cache-first para assets estáticos (JS, CSS, fonts, íconos). Network-first para llamadas a Supabase.

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="CineClue">
```

---

## 26. Accesibilidad (baseline)

- `aria-label` en todos los botones interactivos
- `role="dialog"` + `aria-modal="true"` en overlays
- `role="progressbar"` + `aria-valuenow` en timers y barras de XP
- Contraste mínimo texto secundario: `rgba(255,255,255,0.6)`
- Focus trap en modales
- `prefers-reduced-motion`: deshabilitar animaciones si el usuario lo configura en su OS

---

## 27. Métricas de éxito

| Métrica | Target |
|---|---|
| Partidas completadas (% que llega a Game Over) | > 80% |
| DAU/MAU ratio | > 30% |
| Peli del día completion rate | > 70% de usuarios activos |
| Tasa de share | > 15% |
| Clicks a Letterboxd por partida | > 30% |
| Perfiles públicos visitados por terceros | > 20% de usuarios |
| Streak ≥ 7 días | > 25% de usuarios activos |
| Party: completion rate de salas | > 70% |
| Party: conversión anónimo → registro | > 10% |
| Party: hosts recurrentes (>1 sala) | > 25% |

---

## 28. Lo que NO entra en v1

- Notificaciones push (Web Push API)
- Duelo asíncrono (código de desafío compartible)
- Semana temática del director
- Categorías / filtros por género, país, década
- Modo contrarreloj (Solo con timer)
- Party: salas privadas con contraseña
- Party: chat en tiempo real
- Party: host puede banear jugadores
- Party: selección manual de películas por el host
- Party: teams
- Party: spectator mode
- Chat / comentarios en perfil
- API pública
- Integración directa con Letterboxd API

---

*CineClue PRD v5.0 — Documento único y definitivo · Listo para implementación con IA*
