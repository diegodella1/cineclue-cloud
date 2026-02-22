# CineClue — PRD v4.0
**Producto completo · PWA + Backend · Para generación de código con IA**
**Stack: React + Supabase self-hosted · Auth: Google/Apple OAuth**

---

## 1. Visión del producto

CineClue es una plataforma web de trivia cinematográfica con identidad de usuario, progresión real y competencia social. El jugador adivina películas a partir de 5 pistas progresivas. Cuanto antes adivine, más puntos gana.

**Lo que lo diferencia de otras apps de trivia de cine:**
- Identidad cinematográfica propia: el perfil muestra qué tipo de cinéfilo sos, no solo cuántos puntos tenés
- Peli del día compartida: todos los usuarios juegan la misma película cada día (Wordle-style), lo que genera conversación orgánica
- ELO real: el ranking refleja habilidad, no volumen jugado
- Streaks y misiones: razón para volver todos los días
- Perfil público con URL compartible: la "huella cinematográfica" es motivo de orgullo y vector de viralidad

**Plataforma:** PWA standalone en `cineclue.game`. Funciona en mobile y desktop. Instalable desde el browser.

**Backend:** Supabase self-hosted (PostgreSQL + Auth + Realtime + Edge Functions).

**Target primario:** Cinéfilos hispanohablantes 18–35, usuarios de Instagram y Letterboxd.
**Target secundario:** Grupos de amigos, comunidades de cine online.

---

## 2. Stack técnico completo

| Componente | Tecnología |
|---|---|
| Frontend | React (Vite + JSX + hooks) |
| Estilo | Tailwind CSS — mobile-first, max-width 600px |
| Routing | React Router v6 |
| Estado global | Zustand |
| Backend | Supabase self-hosted |
| Base de datos | PostgreSQL (vía Supabase) |
| Auth | Supabase Auth — Google OAuth + Apple OAuth |
| Realtime | Supabase Realtime (rankings en vivo) |
| Cron jobs | Supabase Edge Functions + pg_cron |
| Fonts | Google Fonts CDN (Playfair Display, DM Sans, DM Mono) |
| Share image | Canvas API (2D context) |
| Share nativo | Web Share API con fallback a overlay |
| Hosting frontend | Vercel / Netlify (o self-hosted con Nginx) |
| Hosting backend | Server propio con Supabase self-hosted |
| PWA | manifest.json + service-worker.js |

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
| Layout | `max-width: 600px`, centrado, `padding: 0 16px` |
| Border radius | 12px cards, 8px botones |
| Safe area | `env(safe-area-inset-*)` para notch/Dynamic Island |

---

## 4. Arquitectura de la base de datos

### 4.1 Tablas principales

```sql
-- Usuarios (extensión del auth.users de Supabase)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,          -- @handle público (ej: "diego")
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  streak_current INT DEFAULT 0,
  streak_best INT DEFAULT 0,
  streak_last_played DATE,
  elo INT DEFAULT 1000,                   -- Rating ELO global
  xp INT DEFAULT 0,                       -- XP acumulado (nunca se resetea)
  level INT DEFAULT 1,                    -- Nivel calculado desde XP
  games_played INT DEFAULT 0,
  games_completed INT DEFAULT 0,
  total_score INT DEFAULT 0
);

-- Películas
CREATE TABLE movies (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,                    -- Nombre principal en español
  alt TEXT[] DEFAULT '{}',               -- Alternativas aceptadas
  diff TEXT CHECK (diff IN ('fácil','medio','difícil')),
  lb TEXT NOT NULL,                       -- Slug Letterboxd
  clues JSONB NOT NULL,                   -- Array de 5 pistas
  genres TEXT[] DEFAULT '{}',            -- ['drama','thriller',...]
  country TEXT,                           -- País de origen
  decade INT,                             -- Década (1970, 1980, etc.)
  director TEXT,
  active BOOLEAN DEFAULT TRUE
);

-- Peli del día (programada por cron)
CREATE TABLE daily_movies (
  id SERIAL PRIMARY KEY,
  movie_id INT REFERENCES movies(id),
  date DATE UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partidas (cada sesión de juego)
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  mode TEXT CHECK (mode IN ('solo','daily','duel_local')),
  played_at TIMESTAMPTZ DEFAULT NOW(),
  completed BOOLEAN DEFAULT FALSE,
  total_score INT DEFAULT 0,
  max_possible INT DEFAULT 25,
  movies_played JSONB NOT NULL,           -- [{movie_id, points_earned, guessed, clue_revealed}]
  elo_before INT,
  elo_after INT,
  elo_delta INT
);

-- Ranking semanal (snapshot que se resetea cada lunes)
CREATE TABLE weekly_rankings (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  week_start DATE NOT NULL,              -- Lunes de esa semana
  score INT DEFAULT 0,                   -- Puntos acumulados esa semana
  games_played INT DEFAULT 0,
  elo_at_end INT,
  position INT,                          -- Calculado al cerrar la semana
  UNIQUE(user_id, week_start)
);

-- Hall of fame (snapshots semanales históricos)
CREATE TABLE hall_of_fame (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  week_start DATE NOT NULL,
  position INT NOT NULL,                 -- 1, 2, 3
  score INT NOT NULL,
  elo INT NOT NULL
);

-- Misiones
CREATE TABLE missions (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,            -- 'win_3_hard', 'daily_streak_7', etc.
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT CHECK (type IN ('weekly','permanent','special')),
  condition JSONB NOT NULL,             -- {type: 'guess_hard', count: 3}
  reward_xp INT DEFAULT 0,
  reward_badge TEXT,                    -- slug de badge, si aplica
  active BOOLEAN DEFAULT TRUE
);

-- Progreso de misiones por usuario
CREATE TABLE mission_progress (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  mission_id INT REFERENCES missions(id),
  progress INT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  week_start DATE,                      -- Para misiones semanales
  UNIQUE(user_id, mission_id, week_start)
);

-- Badges
CREATE TABLE badges (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,                   -- Emoji o URL de ícono
  condition JSONB NOT NULL              -- Cómo se gana
);

-- Badges ganados por usuario
CREATE TABLE user_badges (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  badge_slug TEXT REFERENCES badges(slug),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_slug)
);

-- Estadísticas por categoría (para huella cinematográfica)
CREATE TABLE user_category_stats (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  category_type TEXT CHECK (category_type IN ('genre','country','decade')),
  category_value TEXT,                  -- 'drama', 'Argentina', '1990'
  guessed INT DEFAULT 0,
  played INT DEFAULT 0,
  UNIQUE(user_id, category_type, category_value)
);
```

### 4.2 Índices críticos

```sql
CREATE INDEX idx_games_user_mode ON games(user_id, mode);
CREATE INDEX idx_weekly_rankings_week ON weekly_rankings(week_start, score DESC);
CREATE INDEX idx_daily_movies_date ON daily_movies(date);
CREATE INDEX idx_mission_progress_user ON mission_progress(user_id, completed);
CREATE INDEX idx_user_category_stats_user ON user_category_stats(user_id, category_type);
```

---

## 5. Auth y onboarding

### 5.1 Flujo de registro

```
Landing → Botón "Entrar con Google" / "Entrar con Apple"
       → Supabase OAuth redirect
       → Callback → check si profiles.id existe
         ├── Existe → ir a Home
         └── No existe → Pantalla "Elegí tu username"
                       → Validar unicidad en tiempo real
                       → Crear registro en profiles
                       → ir a Home
```

### 5.2 Username

- Entre 3 y 20 caracteres
- Solo letras, números, guiones y underscores
- Único en la plataforma
- Editable desde el perfil (máximo 1 vez por mes)
- URL pública: `cineclue.game/u/{username}`

### 5.3 Sesión

- JWT de Supabase, refresh automático
- Si el usuario no está logueado puede jugar en modo "visitante" (solo Solo local, sin guardar stats)
- Se le muestra CTA de registro al terminar la primera partida: "Guardá tu puntaje y construí tu perfil"

---

## 6. Modos de juego

### 6.1 Peli del día (Wordle-style) ⭐ Modo principal

| Parámetro | Valor |
|---|---|
| Películas | 1 película por día, igual para todos los usuarios |
| Programación | Cron job diario a las 00:00 UTC-3 (Argentina) |
| Rondas | 1 película, 5 pistas |
| Puntos | Máximo 5 pts (según en qué pista adivina) |
| ELO | Sí — afecta el ranking global |
| Streak | Sí — cuenta para la racha diaria |
| Jugable | Una sola vez por día por usuario |
| Estado post-juego | Muestra cuántos usuarios adivinaron y en qué pista |

**Programación automática (cron):**
```sql
-- Supabase Edge Function ejecutada por pg_cron todos los días a las 00:00 UTC-3
-- Lógica:
-- 1. Buscar películas que no hayan sido "peli del día" en los últimos 108 días
-- 2. Distribuir dificultad: alterna fácil/medio/difícil en ciclos de 3
-- 3. Insertar en daily_movies para la fecha de mañana
```

**Pantalla post-juego (Solo la peli del día):**
- "Hoy la adivinaron X% de los jugadores"
- "La mayoría la adivinó en la pista Y"
- Mini-gráfico de distribución de pistas (estilo Wordle)
- Tiempo hasta la próxima peli del día (countdown)

---

### 6.2 Modo Solo (clásico)

| Parámetro | Valor |
|---|---|
| Rondas | 5 |
| Selección | Balanceada: 2 fáciles + 2 medias + 1 difícil |
| Puntos máximos | 25 pts |
| ELO | Sí (con menor peso que la peli del día) |
| Streak | No (solo la peli del día alimenta el streak) |
| Jugable | Ilimitadas veces por día |

---

### 6.3 Duelo 1v1 local

| Parámetro | Valor |
|---|---|
| Jugadores | 2, mismo dispositivo |
| Rondas | 5 |
| Timer | 12 segundos por pista |
| ELO | No (es local, sin auth del rival) |
| Auth requerida | Solo el anfitrión (J1) |

---

## 7. Sistema de ELO

### 7.1 Filosofía
El ELO refleja habilidad real, no volumen. Adivinar una película difícil en pista 1 da mucho más ELO que adivinar una fácil en pista 5. Perder ELO es posible.

### 7.2 Cálculo

```js
// Base: puntos obtenidos / puntos posibles de la partida
// Ajuste por dificultad de las películas jugadas
// Ajuste por cantidad de partidas jugadas (incertidumbre K-factor)

function calculateELO(currentELO, gamesPlayed, score, maxScore, movieDifficulties) {
  const K = gamesPlayed < 10 ? 40 : gamesPlayed < 30 ? 20 : 10;
  
  // Performance esperada: media de 60% de los puntos posibles
  const performance = score / maxScore;
  const expected = 0.60;
  
  // Multiplicador de dificultad
  const hardCount = movieDifficulties.filter(d => d === 'difícil').length;
  const easyCount = movieDifficulties.filter(d => d === 'fácil').length;
  const diffMultiplier = 1 + (hardCount * 0.15) - (easyCount * 0.05);
  
  const delta = Math.round(K * (performance - expected) * diffMultiplier);
  return Math.max(100, currentELO + delta); // ELO mínimo: 100
}
```

### 7.3 Rangos ELO

| Rango | ELO | Título |
|---|---|---|
| 🌱 | < 800 | Espectador |
| 🎟 | 800–999 | Aficionado |
| 🎬 | 1000–1199 | Cinéfilo |
| 🏆 | 1200–1399 | Crítico |
| 🎭 | 1400–1599 | Curador |
| ⭐ | ≥ 1600 | Maestro del Cine |

El rango se muestra en el perfil y en el ranking.

---

## 8. Sistema de streaks

### 8.1 Reglas

- El streak aumenta si el usuario juega **la peli del día** en días consecutivos
- Solo la peli del día cuenta para el streak (el modo Solo no)
- Si no jugás la peli del día, el streak se resetea a 0 al día siguiente
- Gracia: si el usuario tiene streak ≥ 7, tiene 1 "escudo" de protección que puede usar para saltear 1 día sin perder el streak (se usa automáticamente)

### 8.2 Hitos de streak con recompensas

| Días | Recompensa |
|---|---|
| 3 días | +50 XP |
| 7 días | Badge "Semana completa" + +150 XP |
| 14 días | Badge "Quincena" + +300 XP |
| 30 días | Badge "Mes dedicado" + +500 XP + escudo extra |
| 100 días | Badge "Centenario" + +2000 XP |

### 8.3 Lógica backend

```sql
-- Función ejecutada en cada partida completada (peli del día)
CREATE OR REPLACE FUNCTION update_streak(p_user_id UUID)
RETURNS void AS $$
DECLARE
  last_played DATE;
  today DATE := CURRENT_DATE;
BEGIN
  SELECT streak_last_played INTO last_played FROM profiles WHERE id = p_user_id;
  
  IF last_played = today - 1 OR last_played = today THEN
    -- Continuar streak
    UPDATE profiles SET
      streak_current = streak_current + 1,
      streak_best = GREATEST(streak_best, streak_current + 1),
      streak_last_played = today
    WHERE id = p_user_id;
  ELSE
    -- Resetear streak
    UPDATE profiles SET
      streak_current = 1,
      streak_last_played = today
    WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## 9. Sistema de XP y niveles

### 9.1 Fuentes de XP

| Acción | XP ganado |
|---|---|
| Completar peli del día | +20 XP base |
| Adivinar en pista 1 | +30 XP bonus |
| Adivinar en pista 2 | +20 XP bonus |
| Adivinar una película difícil | +15 XP bonus |
| Completar partida Solo | +10 XP |
| Completar misión semanal | +50–150 XP |
| Lograr badge nuevo | +100 XP |
| Streak milestone | Variable (ver sección 8) |

### 9.2 Tabla de niveles

El XP requerido sigue una curva cuadrática: `XP para nivel N = 100 * N^1.5`

| Nivel | XP requerido | Título desbloqueado |
|---|---|---|
| 1 | 0 | Espectador |
| 5 | 1,118 | Aficionado |
| 10 | 3,162 | Cinéfilo |
| 20 | 8,944 | Crítico |
| 30 | 16,431 | Curador |
| 50 | 35,355 | Maestro |

El nivel nunca se resetea. Es una capa de progresión permanente separada del ELO competitivo.

---

## 10. Misiones

### 10.1 Tipos de misiones

**Semanales (se resetean cada lunes):**

| Misión | Condición | Recompensa |
|---|---|---|
| Maratón | Completar 5 partidas esta semana | +100 XP |
| Ojo clínico | Adivinar 3 películas difíciles | +150 XP |
| Cinéfilo consistente | Jugar la peli del día 5 días seguidos | +200 XP + escudo |
| Descubridor | Clicar 5 links de Letterboxd | +80 XP |
| Velocista | Adivinar 2 películas en pista 1 | +120 XP |

**Permanentes (se completan una sola vez):**

| Misión | Condición | Recompensa |
|---|---|---|
| Primera sangre | Ganar tu primera partida | +50 XP |
| Racha inicial | Alcanzar streak de 3 días | +100 XP |
| Cinéfilo de élite | Alcanzar 20/25 en modo Solo | Badge + 200 XP |
| Un mes de cine | Streak de 30 días | Badge + 500 XP |
| Coleccionista | Adivinar 50 películas únicas | Badge + 300 XP |

### 10.2 UI de misiones

- Accesibles desde el perfil y desde el Home (icono de misiones)
- Las semanales muestran un countdown hasta el lunes
- Las completadas se muestran con check y fade, no desaparecen
- Notification badge en el ícono si hay misiones nuevas sin ver

---

## 11. Huella cinematográfica (perfil)

La huella es el corazón del perfil. Se genera automáticamente a partir del historial de partidas y refleja qué tipo de cinéfilo es el usuario.

### 11.1 Componentes

**Especialidades:** categorías donde el usuario tiene ≥70% de aciertos con ≥5 películas jugadas.
Ejemplo: "Especialista en cine coreano · Fuerte en dramas de los 90"

**Debilidades:** categorías donde el usuario tiene <30% de aciertos con ≥5 películas jugadas.
Ejemplo: "Débil en cine iraní"

**Película favorita adivinada:** la que adivinó con más puntaje (pista 1 en difícil = máximo valor)

**Mapa de géneros:** radar chart con los 6 géneros principales y % de acierto en cada uno

**Línea de tiempo de rachas:** historial visual de streaks

**Estadísticas globales:**
- Partidas jugadas / completadas
- Puntos totales acumulados
- Películas únicas adivinadas (de 108 disponibles)
- Mejor racha
- ELO actual y rango

### 11.2 Textos generados automáticamente

```js
function generateCinematicIdentity(stats) {
  const specialties = getSpecialties(stats);     // ['cine coreano', 'animación']
  const weaknesses = getWeaknesses(stats);        // ['cine iraní']
  const favoriteEra = getFavoriteDecade(stats);   // '1990'
  
  // Ejemplo de output:
  // "Especialista en cine coreano y animación.
  //  Tu década fuerte es los 90.
  //  Todavía por descubrir: cine iraní."
}
```

---

## 12. Perfil público

**URL:** `cineclue.game/u/{username}`

**Visible para todos (sin login):**
- Display name y username
- Avatar (de Google/Apple OAuth)
- ELO y rango actual
- Nivel y barra de XP
- Huella cinematográfica (especialidades + mapa de géneros)
- Badges ganados
- Streak actual y mejor racha
- Estadísticas globales (partidas, películas adivinadas, puntos)
- **NO visible:** historial de partidas individuales, misiones en progreso

**Elementos de la página:**
- Header con foto de perfil, nombre, @username, rango ELO
- Sección "Mi cine": huella cinematográfica con radar chart
- Sección "Logros": badges con fecha de obtención
- Sección "Stats": números clave en formato card
- Botón "Compartir perfil" (genera imagen para Stories)
- CTA para visitantes no logueados: "¿Cuál es tu huella cinematográfica? Jugá gratis"

---

## 13. Ranking semanal

### 13.1 Reglas

- Se resetea cada lunes a las 00:00 UTC-3
- Criterio de ordenamiento: **ELO** (no puntos brutos)
- Desempate: cantidad de partidas jugadas esa semana
- Solo se rankean usuarios que hayan jugado al menos 1 partida esa semana
- La semana anterior se archiva en el Hall of Fame (top 3 con nombre, ELO y score)

### 13.2 Pantalla de ranking

- Tabs: "Esta semana" / "Histórico"
- Lista paginada (20 por página)
- Posición propia siempre visible aunque no esté en la primera página (sticky al fondo)
- Cada fila: posición, avatar, username, rango ELO, score semanal
- Tiempo hasta el reset (countdown)
- Supabase Realtime: se actualiza en tiempo real mientras está abierta la pantalla

### 13.3 Notificación de posición

Cuando el usuario termina una partida y su ELO cambia, mostrar: "Subiste al puesto #X del ranking semanal 🎬"

---

## 14. Sistema de pistas

Cada película tiene exactamente 5 pistas reveladas en orden de menor a mayor obviedad:

| # | Tipo | Puntos | Descripción | Regla de contenido |
|---|---|---|---|---|
| 1 | Emojis | 5 pts | 5 emojis que representan temas, escenas o símbolos | No deletrear el título con emojis |
| 2 | Dato oscuro | 4 pts | Trivia de producción poco conocida | Sin título, director ni actores por nombre |
| 3 | Dato revelador | 3 pts | Trivia más identificable | Puede aludir al director/actores indirectamente |
| 4 | Frase icónica | 2 pts | Cita memorable, textual, entre comillas | — |
| 5 | Sinopsis | 1 pt | Resumen argumental sin spoilers duros | Nunca mencionar título, personajes, actores ni director |

---

## 15. Sistema de respuestas

### 15.1 Normalización

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

### 15.2 Validación (match bidireccional)

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

### 15.3 Feedback por estado

| Estado | Visual |
|---|---|
| Correcto | Borde dorado, título revelado, `"+X pts"` con animación pop |
| Incorrecto | Shake en el input, borde rojo |
| Pasar | Título revelado, badge "No la conocías" |

---

## 16. Integración Letterboxd

- URL: `https://letterboxd.com/film/{lb}/`
- Copy: "🎬 Ver en Letterboxd" (si adivinó) / "🎬 Descubrila en Letterboxd" (si no)
- Aparece en: resultado de ronda, Game Over, perfil público (películas adivinadas)
- `target="_blank"` + `rel="noopener noreferrer"`
- Clic en Letterboxd suma progreso a la misión "Descubridor"

---

## 17. Pantallas e inventario completo

### 17.1 Pantallas públicas (sin auth)

| # | Ruta | Descripción |
|---|---|---|
| L1 | `/` | Landing: propuesta de valor, CTA registro/login, preview de peli del día |
| L2 | `/u/{username}` | Perfil público (ver sección 12) |
| L3 | `/ranking` | Ranking semanal (lectura, sin votar) |

### 17.2 Pantallas de auth

| # | Ruta | Descripción |
|---|---|---|
| A1 | `/auth` | Login con Google / Apple |
| A2 | `/onboarding` | Elegir username (solo primera vez) |

### 17.3 App (requiere auth)

| # | Ruta | Descripción |
|---|---|---|
| G1 | `/home` | Home: acceso a modos, estado del streak, peli del día CTA |
| G2 | `/daily` | Peli del día |
| G3 | `/solo` | Modo Solo |
| G4 | `/duel` | Modo Duelo local |
| G5 | `/ranking` | Ranking semanal interactivo |
| G6 | `/missions` | Misiones activas y completadas |
| G7 | `/profile` | Perfil propio (editable) |
| G8 | `/profile/edit` | Editar display name, username |

---

### Pantalla Home (G1)

- Header: avatar + username + rango ELO + streak actual (🔥 X días)
- Card "Peli del día": si no jugó → CTA "Jugar ahora"; si ya jugó → resultado y countdown a mañana
- Botones: "Jugar Solo" / "Duelo 1v1"
- Mini-ranking: top 3 de la semana + posición propia
- Misiones activas: 2–3 misiones con barra de progreso
- Notificaciones de badges nuevos (si aplica)

---

### Pantalla Peli del día (G2)

Igual a la pantalla de juego Solo pero con:
- Header: "🎬 Peli del día — [Fecha]"
- Sin opción de "Jugar de nuevo" (una sola vez)
- Post-juego: distribución de aciertos de todos los usuarios (estilo Wordle)
- Post-juego: countdown a la próxima peli

---

### Pantalla Juego Solo (G3)

- Header: "Ronda X / 5" + puntos acumulados
- Card con pistas reveladas (activa resaltada, anteriores en opacidad reducida)
- Label: "Pista X — vale X pts"
- Input: `"¿Qué película es?"`
- Botón "Adivinar" (primario)
- Botón "Revelar siguiente pista (→ X pts)" (secundario, disabled en pista 5)
- Botón "Pasar" (ghost)

---

### Pantalla Resultado de ronda

- "¡Correcto! +X pts" / "Sin puntos" / "Pasaste"
- Título en dorado (grande)
- Badge de dificultad (FÁCIL / MEDIO / DIFÍCIL)
- Link Letterboxd (copy contextual)
- "Siguiente →"

---

### Pantalla Game Over (Solo y Daily)

- Puntaje: "X / 25"
- Badge de nivel (ver sección 17.7)
- Delta ELO: "+12 ELO 🎬" o "-5 ELO" (según resultado)
- Tabla: 5 filas con título clickeable a Letterboxd, dificultad, puntos
- Misiones: si alguna se completó con esta partida → celebración inline
- Botones: "Jugar de nuevo" (Solo) / "Compartir" / "Ir al ranking" / "Menú"
- (Daily): sin "Jugar de nuevo", countdown a mañana

---

### Pantalla Duelo (Setup → Juego → Resultado → Game Over)

Ver PRD v3.0 sección 8. Sin cambios respecto al duelo local, excepto que J1 debe estar logueado.

---

### Pantalla Ranking semanal (G5)

- Countdown al próximo reset (lunes 00:00)
- Lista de usuarios: posición, avatar, username, rango, ELO, score semanal
- Posición propia: sticky al fondo si no está en el top visible
- Tab "Histórico": hall of fame de semanas pasadas (top 3 por semana)
- Actualización en tiempo real (Supabase Realtime)

---

### Pantalla Misiones (G6)

- Tabs: "Semanales" / "Permanentes"
- Cada misión: ícono, título, descripción, barra de progreso, recompensa
- Completadas: check dorado, XP ganado, fecha
- Countdown semanal para las misiones semanales

---

### Pantalla Perfil propio (G7)

Igual al perfil público (L2) pero con:
- Botón "Editar perfil" → `/profile/edit`
- Historial de partidas recientes (últimas 10)
- Progreso de misiones permanentes
- Nivel y barra de XP detallada

---

### Badge de nivel (partidas Solo)

| Badge | Condición |
|---|---|
| 🏆 Cinéfilo de élite | ≥ 20 pts (≥80%) |
| 🎬 Gran conocedor | ≥ 15 pts (≥60%) |
| 👁 Buen ojo | ≥ 10 pts (≥40%) |
| 🍿 Espectador casual | ≥ 5 pts (≥20%) |
| 🎟 Recién arrancás | < 5 pts |

---

## 18. Share y viralidad

### 18.1 Share de resultado de partida (Stories)

Flujo (mismo que v3.0):
1. Intentar `navigator.share({ files: [blob] })`
2. Fallback: overlay fullscreen con long-press para guardar

**Card de resultado (Canvas 1080×1920):**
```
[Logo CineClue — arriba]
[Rango ELO del usuario]

PELI DEL DÍA / MODO SOLO
[Fecha si es daily]

[Badge de nivel + texto]
X / 25 pts    +Y ELO

[Tabla de 5 películas]
  Título         ●Dificultad    X pts

¿Cuál es tu huella cinematográfica?
cineclue.game
```

### 18.2 Share de perfil

Desde la página de perfil público:
- Genera imagen con: avatar, username, rango ELO, especialidades, badges top 3, stats clave
- CTA en la imagen: "¿Cuál es tu cine? cineclue.game"

### 18.3 Reglas técnicas del Canvas

- Sin emojis en `fillText()` — solo texto y símbolos unicode simples
- Fuentes cargadas explícitamente con `FontFace` antes de renderizar
- Dimensiones: 1080×1920 (Stories) y 1080×1080 (feed, futuro)
- `canvas.toBlob('image/png')` para obtener el archivo

---

## 19. Cron jobs y automatización

### 19.1 Peli del día (diario)

**Ejecuta:** todos los días a las 00:00 UTC-3
**Lógica:**

```js
// Supabase Edge Function: schedule-daily-movie
async function scheduleDailyMovie() {
  // 1. Traer películas no jugadas en los últimos 108 días como peli del día
  const recentMovieIds = await getRecentDailyMovieIds(108);
  const candidates = await getMoviesExcluding(recentMovieIds);

  // 2. Ciclo de dificultad: fácil → medio → difícil → fácil → ...
  const tomorrow = getNextDate();
  const cycleIndex = getDaysSinceEpoch(tomorrow) % 3;
  const targetDiff = ['fácil', 'medio', 'difícil'][cycleIndex];
  
  const filtered = candidates.filter(m => m.diff === targetDiff);
  const movie = randomFrom(filtered);
  
  // 3. Insertar
  await supabase.from('daily_movies').insert({
    movie_id: movie.id,
    date: tomorrow
  });
}
```

**pg_cron setup:**
```sql
SELECT cron.schedule('schedule-daily-movie', '0 3 * * *', 'SELECT http_post(...)');
-- 03:00 UTC = 00:00 UTC-3
```

### 19.2 Reset ranking semanal (lunes)

**Ejecuta:** todos los lunes a las 00:00 UTC-3

```js
async function resetWeeklyRanking() {
  const weekStart = getLastMonday();
  
  // 1. Calcular posiciones finales
  const rankings = await getWeeklyRankings(weekStart);
  
  // 2. Guardar top 3 en hall of fame
  await saveHallOfFame(rankings.slice(0, 3), weekStart);
  
  // 3. Actualizar posición final en weekly_rankings
  await updateFinalPositions(rankings, weekStart);
  
  // 4. Crear entradas vacías para la nueva semana
  // (se crean on-demand cuando el usuario juega)
}
```

### 19.3 Actualización de misiones semanales (lunes)

**Ejecuta:** junto con el reset del ranking
- Marcar las misiones semanales de la semana anterior como expiradas
- Las misiones permanentes no se resetean

---

## 20. Base de datos de películas

### 20.1 Estructura TypeScript

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

### 20.2 Distribución

| Dificultad | Cantidad | Criterio |
|---|---|---|
| Fácil | 36 (33%) | Blockbusters, animación mainstream, frases universales |
| Medio | 46 (43%) | Cine de autor accesible, thrillers, dramas premiados |
| Difícil | 26 (24%) | Cine de autor internacional, clásicos de festival, cine latinoamericano de nicho |

### 20.3 Selección balanceada por partida (Solo)

```js
function selectMovies(pool) {
  const easy = shuffle(pool.filter(m => m.diff === "fácil")).slice(0, 2);
  const medium = shuffle(pool.filter(m => m.diff === "medio")).slice(0, 2);
  const hard = shuffle(pool.filter(m => m.diff === "difícil")).slice(0, 1);
  return shuffle([...easy, ...medium, ...hard]);
}
```

---

## 21. PWA checklist

```json
// manifest.json
{
  "name": "CineClue",
  "short_name": "CineClue",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**service-worker.js:** Cache-first para assets estáticos (JS, CSS, fonts, iconos). Network-first para llamadas a la API de Supabase.

**Meta tags requeridos:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="CineClue">
```

---

## 22. Row Level Security (Supabase)

```sql
-- profiles: público para lectura, solo el dueño puede escribir
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Perfiles públicos" ON profiles FOR SELECT USING (true);
CREATE POLICY "Solo dueño edita su perfil" ON profiles FOR UPDATE USING (auth.uid() = id);

-- games: solo el dueño ve y crea sus partidas
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver propias partidas" ON games FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Crear propias partidas" ON games FOR INSERT WITH CHECK (auth.uid() = user_id);

-- weekly_rankings: público para lectura
ALTER TABLE weekly_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rankings públicos" ON weekly_rankings FOR SELECT USING (true);

-- mission_progress: solo el dueño
ALTER TABLE mission_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver propio progreso" ON mission_progress FOR SELECT USING (auth.uid() = user_id);

-- daily_movies: todos pueden leer
ALTER TABLE daily_movies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Daily movies públicas" ON daily_movies FOR SELECT USING (true);
```

---

## 23. Flujo de una partida completa (backend)

```
Usuario completa partida
  ↓
POST /api/games/complete
  {
    mode: "daily" | "solo",
    movies_played: [{movie_id, points_earned, guessed, clue_revealed_at}],
    total_score: N
  }
  ↓
Edge Function: game-complete
  1. Validar que la partida es válida (peli del día: no jugada hoy, etc.)
  2. Insertar en games
  3. Calcular delta ELO → actualizar profiles.elo
  4. Calcular XP ganado → actualizar profiles.xp y profiles.level
  5. Si es daily: update_streak()
  6. Actualizar user_category_stats (por género, país, década)
  7. Upsert weekly_rankings para la semana actual
  8. Evaluar misiones: check_missions(user_id, game_data)
  9. Evaluar badges nuevos
  10. Return: { elo_delta, xp_gained, new_badges, missions_completed, new_level }
```

---

## 24. Accesibilidad (baseline)

- `aria-label` en todos los botones
- `role="dialog"` + `aria-modal="true"` en overlays
- `role="progressbar"` con `aria-valuenow` en timer y barras de XP
- Contraste mínimo texto secundario: `rgba(255,255,255,0.6)`
- Focus trap en modales
- `prefers-reduced-motion`: deshabilitar animaciones si el usuario lo configura en su OS

---

## 25. Métricas de éxito

| Métrica | Target |
|---|---|
| Partidas completadas (% que llega a Game Over) | > 80% |
| DAU/MAU ratio | > 30% (indica hábito diario) |
| Peli del día completion rate | > 70% de usuarios activos |
| Tasa de share | > 15% |
| Clicks a Letterboxd por partida | > 30% |
| Perfiles públicos visitados por terceros | > 20% de usuarios |
| Streak ≥ 7 días | > 25% de usuarios activos |

---

## 26. Lo que NO entra en v1

- Notificaciones push (Web Push API) — fase 2
- Duelo asíncrono (código de desafío compartible) — fase 2
- Semana temática del director — fase 2
- Categorías / filtros por género, país, década — fase 2
- Modo contrarreloj — fase 2
- Chat / comentarios — fase 3
- API pública — fase 3
- Integración directa con Letterboxd API — fase 3

---

*CineClue PRD v4.0 — Producto completo con gamificación, perfiles y backend Supabase*
*Listo para implementación con IA*
