# CineClue — Instrucciones para Claude

## Qué es este proyecto

CineClue es una app de trivia de cine con identidad propia. La creó Agustín, content creator argentino de cine con 750K seguidores en Instagram. La idea es simple: te muestran 5 pistas progresivas sobre una película (de emojis hasta sinopsis) y tenés que adivinar el título. Cuanto antes adivinás, más puntos sumás.

Está pensada para cinéfilos hispanohablantes que quieren algo más que un quiz genérico: tiene progresión real, perfil cinematográfico propio, modo diario Wordle-style y duelos asíncronos.

Está deployada en **cineclue.vercel.app**.

---

## Stack

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | React | 19.2.0 |
| Routing | React Router | 6 |
| Estado global | Zustand | 5 |
| Build | Vite | 7 |
| Estilos | Tailwind CSS | v4 |
| BaaS | Supabase (auth, PostgreSQL, RLS, RPC) | 2.97 |
| Push notifications | OneSignal | — |
| Deploy | Vercel | — |

**Base de datos:** PostgreSQL con Row Level Security en todas las tablas. La lógica de negocio compleja (ELO, progresión, duelos) vive en funciones PL/pgSQL llamadas como RPC desde el cliente.

---

## Estructura de carpetas

```
src/
├── App.jsx                  # Router principal + guard RequireAuth + lazy loading
├── main.jsx                 # Entry point
├── index.css                # Tailwind v4 + tokens de diseño + animaciones
│
├── pages/                   # Una página = una ruta
│   ├── Landing.jsx          # Página pública para no autenticados
│   ├── Auth.jsx             # Login / registro (email + Google OAuth)
│   ├── Onboarding.jsx       # Elegir username la primera vez
│   ├── Home.jsx             # Dashboard post-login: acceso a todos los modos
│   ├── SoloGame.jsx         # Modo solo: 5 películas aleatorias
│   ├── DailyGame.jsx        # Peli del Día: misma película para todos
│   ├── DuelSetup.jsx        # Buscar rival y crear duelo
│   ├── DuelGame.jsx         # Jugar un duelo (propio turno)
│   ├── Ranking.jsx          # Ranking semanal + Hall of Fame
│   ├── Missions.jsx         # Misiones semanales y permanentes
│   ├── Profile.jsx          # Perfil propio: stats, radar, badges
│   ├── PublicProfile.jsx    # Perfil público (/u/:username)
│   ├── Admin.jsx            # Panel admin: películas, usuarios, analytics
│   └── About.jsx            # Créditos
│
├── components/
│   ├── game/
│   │   ├── ClueCard.jsx     # Muestra la pista actual con animaciones
│   │   ├── GuessInput.jsx   # Input de la respuesta (normalizado)
│   │   ├── RoundResult.jsx  # Resultado de una ronda: puntos + emoji
│   │   ├── GameOver.jsx     # Pantalla final: score, ELO delta, share
│   │   ├── Countdown.jsx    # Temporizador visual para duelos
│   │   └── DailyStats.jsx   # Stats agregadas del día en Daily
│   ├── layout/
│   │   ├── AppShell.jsx     # Wrapper con fondo oscuro + efecto grain
│   │   └── BottomNav.jsx    # Navegación inferior (5 tabs)
│   ├── profile/
│   │   └── RadarChart.jsx   # Radar de especialidades por género (canvas)
│   └── shared/
│       ├── Toast.jsx        # Notificaciones flotantes globales
│       ├── Loading.jsx      # Spinner de carga
│       ├── ShareButton.jsx  # Compartir imagen generada por canvas
│       ├── BarChart.jsx     # Gráfico de barras canvas para stats
│       ├── InstallPrompt.jsx # Banner de instalación PWA
│       └── DuelNotifications.jsx # Notificaciones push de duelos (OneSignal)
│
├── hooks/                   # Lógica de negocio extraída de páginas
│   ├── useGame.js           # Juego solo: carga películas, valida respuestas
│   ├── useDaily.js          # Peli del Día: detecta si ya jugó hoy
│   ├── useDuel.js           # Lógica de duelo: turno propio y resultado
│   ├── useDuelHub.js        # Hub de duelos: buscar usuarios, duelos pendientes
│   ├── useProfile.js        # Carga perfil público + especialidades
│   ├── useMissions.js       # Misiones activas + progreso
│   └── useRanking.js        # Ranking semanal + Hall of Fame (polling 30s)
│
├── stores/                  # Estado global (Zustand)
│   ├── authStore.js         # Usuario, sesión, perfil, onboarding, duelos pendientes
│   ├── gameStore.js         # Estado de la partida en curso (rondas, pistas, score)
│   └── uiStore.js           # Toasts y loadings globales
│
└── lib/                     # Utilidades puras (sin side effects de React)
    ├── supabase.js          # Inicializa el cliente Supabase
    ├── auth.js              # signUp, signIn, signInWithGoogle, signOut
    ├── constants.js         # ELO_RANKS, POINTS_BY_CLUE, CLUE_LABELS
    ├── elo.js               # Cálculo ELO con K-factor adaptativo
    ├── xp.js                # Niveles y progreso de XP
    ├── normalize.js         # Normaliza títulos y valida respuestas
    └── share.js             # Genera imágenes canvas para compartir en redes

supabase/
└── migrations/              # SQL progresivo (001 a 012+)
    ├── 001_core_schema.sql  # Tablas base: profiles, movies, games, admins
    ├── 002_game_functions.sql # RPCs: cc_select_solo_movies, cc_complete_game
    ├── 003_seed_movies.sql  # Películas iniciales
    ├── 004_daily_cron.sql   # Cron para programar la peli del día
    ├── 005_progression.sql  # ELO delta, XP en cc_games
    ├── 006_ranking.sql      # cc_weekly_rankings, cc_hall_of_fame, cc_get_ranking
    ├── 007_missions_badges.sql # Misiones, badges, progreso
    ├── 008_profiles.sql     # cc_user_category_stats (radar por género)
    ├── 009_admin_analytics.sql # Analytics para el panel admin
    ├── 010_admin_toggle.sql # RPC cc_toggle_admin
    ├── 011_async_duels.sql  # cc_duels + 6 RPCs de duelos
    └── 012_duel_preferences.sql # Preferencias de duelos
```

---

## Modos de juego

### Solo (`/solo`)
- 5 películas aleatorias por partida, seleccionadas por la RPC `cc_select_solo_movies` con balance de dificultad: 2 fáciles + 2 medias + 1 difícil.
- Cada película tiene 5 pistas en orden: emojis → dato oscuro → dato revelador → frase icónica → sinopsis.
- Puntos según en qué pista adivinás: [5, 4, 3, 2, 1]. Si saltás: 0.
- Al finalizar las 5 películas, se guarda la partida (RPC `cc_complete_game`), se recalcula ELO, y se puede compartir imagen.

### Peli del Día (`/daily`)
- Una sola película igual para todos los usuarios, programada a las 03:00 UTC.
- Solo se puede jugar una vez por día. Si ya jugaste, muestra el resultado histórico.
- Wordle-style: todos comparan el mismo desafío.

### Duelo asíncrono (`/duel` → `/duel/play`)
- Buscás a otro usuario por username, lo retás con un set de películas.
- El retador juega primero y su score queda guardado.
- El retado recibe una push notification (OneSignal) y juega en su tiempo.
- Gana quien hizo más puntos. Expiración automática si no responden.
- Estado del duelo: `waiting` → `completed` / `expired`.

---

## Sistema de progresión

### ELO (`src/lib/elo.js`)
- K-factor adaptativo: 40 (primeros 10 juegos) → 20 (10–30 juegos) → 10 (30+).
- Performance esperada: 60%. Si superás ese umbral ganás ELO, si no perdés.
- Multiplicador por dificultad: +15% por cada película difícil, –5% por cada fácil.
- ELO mínimo: 100. No puede bajar de ahí.

**Ranks ELO (`src/lib/constants.js`):**
| Rango | ELO |
|-------|-----|
| 🌱 Espectador | 0–799 |
| 🎟 Aficionado | 800–999 |
| 🎬 Cinéfilo | 1000–1199 |
| 🏆 Crítico | 1200–1399 |
| 🎭 Curador | 1400–1599 |
| ⭐ Maestro del Cine | 1600+ |

### XP y niveles (`src/lib/xp.js`)
- XP se acumula con cada partida completada.
- Los niveles y umbrales vienen del servidor via RPC `cc_get_levels`.

### Streaks
- Se guarda `streak_current`, `streak_best`, `streak_last_played` en el perfil.
- Romper la racha diaria resetea `streak_current` a 0.

### Misiones (`src/hooks/useMissions.js`)
- Semanales (se resetean) y permanentes.
- Recompensas en XP.
- Progreso por usuario en tabla `cc_mission_progress`.

### Radar cinematográfico (`src/components/profile/RadarChart.jsx`)
- Canvas que muestra especialidades por género (acción, drama, comedia, etc.).
- Datos en `cc_user_category_stats`, actualizado al completar partidas.

---

## Bugs conocidos pendientes

Estos bugs existían en el archivo original y **todavía aplican** en la versión cloud:

### 1. Matching solo exacto — `src/lib/normalize.js:check()`

La función `check()` normaliza el input del usuario (lowercase, sin acentos, sin puntuación) y compara contra el título y sus alternativas con `Array.includes()` — es decir, **igualdad exacta de string**.

**Problema:** cualquier error tipográfico o respuesta parcialmente correcta se rechaza. Si la película es "El Padrino" y el usuario escribe "El Parrino" (error de tipeo), no acepta. Si escribe solo "Padrino" sí acepta porque strip de artículos cubre ese caso, pero "Godfather" solo lo acepta si está explícitamente en el campo `alt[]` de la película.

**No hay fuzzy matching ni Levenshtein.** Esto afecta la experiencia especialmente en mobile donde los errores de tipeo son frecuentes.

```js
// src/lib/normalize.js — línea 26
return inputs.some(i => targets.includes(i))  // solo igualdad exacta
```

**Solución potencial:** agregar tolerancia de 1–2 caracteres de edición para inputs que superen cierta longitud, o mostrar un "casi" como feedback sin revelar la respuesta.

---

### 2. Balance de dificultad frágil en Solo — `src/stores/gameStore.js:loadSoloMovies()`

La RPC `cc_select_solo_movies` selecciona 2 fáciles + 2 medias + 1 difícil. Está bien diseñado, **pero falla silenciosamente** si el catálogo no tiene suficientes películas en alguna categoría.

**Problema:** si hay menos de 2 películas `fácil` activas en la DB, la UNION ALL retorna menos de 5 películas sin error. El cliente no valida el conteo antes de arrancar la partida, entonces el juego puede lanzarse con 3 o 4 películas sin avisarle nada al usuario.

```js
// src/stores/gameStore.js — línea 22
const shuffled = data.sort(() => Math.random() - 0.5)  // no valida data.length === 5
set({ movies: shuffled, ... })
```

**Segundo problema:** `sort(() => Math.random() - 0.5)` es un shuffle no uniforme (bias conocido de V8). Usar Fisher-Yates sería más correcto.

**Solución potencial:** validar `data.length === 5` antes de arrancar, mostrar error si el catálogo está incompleto, y reemplazar el sort por un shuffle correcto.

---

## Convenciones del proyecto

- **Español rioplatense** en toda la UI: "adivinás", "jugás", "vos", "arrancá". No castellano neutro.
- **Tailwind v4** — los tokens de diseño van en `@theme` dentro de `src/index.css`, no en `tailwind.config.js`.
- **No hay TypeScript** — el proyecto es JavaScript puro con JSX.
- **RLS activo** — toda query a Supabase pasa por Row Level Security. Si algo falla con permisos, revisar las políticas en las migraciones.
- **RPCs para operaciones complejas** — no escribir lógica de negocio crítica (ELO, XP, duelos) solo en el cliente. Tiene que vivir en funciones PL/pgSQL.
- **Canvas para imágenes compartibles** — `src/lib/share.js` genera 4 tipos de imagen (solo, daily, duelo, perfil). Las fuentes se cargan lazy desde Google Fonts.
- **Zustand sin immer** — el estado se muta devolviendo el nuevo objeto en `set()`.
- **Lazy loading** — todas las páginas se importan con `lazy()` en `App.jsx`. Mantener ese patrón al agregar páginas nuevas.
