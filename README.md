# CineClue

Trivia de cine con identidad. Adiviná películas a partir de pistas progresivas, competí en rankings semanales, completá misiones y demostrá tu huella cinéfila.

**[cineclue.vercel.app](https://cineclue.vercel.app)**

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Routing | React Router v6 |
| State | Zustand |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Auth | Email/password + Google OAuth |
| Push | OneSignal |
| Deploy | Vercel |

## Modos de juego

- **Solo** — 5 películas al azar, 5 pistas progresivas cada una. Más temprano adivinás, más puntos.
- **Peli del Día** — Una película por día, todos juegan la misma. Cron automático a las 03:00 UTC.
- **Duelo Local** — 2 jugadores en el mismo dispositivo, turnos alternados.
- **Duelo Async** — Desafiá a otros jugadores con notificaciones push.

## Progresión

- **ELO** — Rating dinámico según dificultad y rendimiento (K-factor adaptativo).
- **XP + Niveles** — Experiencia acumulada con niveles progresivos.
- **Streaks** — Racha de días consecutivos jugando.
- **Ranking semanal** — Se resetea los lunes, los mejores pasan al Hall of Fame.
- **Misiones** — Semanales y permanentes con recompensas de XP.
- **Badges** — Logros desbloqueables por streaks y achievements.
- **Perfiles públicos** — Compartí tu huella cinéfila con radar de especialidades.

## PWA

Instalable como app en iOS, Android y desktop. Banner automático de instalación + push notifications vía OneSignal.

## Admin Panel

Accesible en `/admin` para usuarios con rol admin.

- **Dashboard** — KPIs, partidas/día, distribución de ELO, scores y streaks.
- **Películas** — CRUD completo + estadísticas de rendimiento (hit rate, pista promedio).
- **Usuarios** — Lista con sorting, toggle admin desde la UI.
- **Partidas** — Log de últimas 50 partidas + retención diaria.
- **Peli del Día** — Programación manual + auto-generación.
- **Misiones** — Tasa de completado por misión.

## Setup local

### Variables de entorno

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_TMDB_API_KEY=...
```

### Desarrollo

```bash
npm install
npm run dev
```

### Migrations

Aplicar en orden contra la base de datos:

```sql
-- Archivos en supabase/migrations/ (001 a 016)
```

### Primer admin

Después del primer registro, promover manualmente:

```sql
INSERT INTO cc_admins (user_id)
SELECT id FROM cc_profiles WHERE username = '<tu-username>';
```

Después se pueden agregar más admins desde el panel.

## Estructura

```
src/
├── pages/           Auth, Home, SoloGame, DailyGame, DuelSetup,
│                    DuelGame, Ranking, Missions, Profile,
│                    PublicProfile, Admin, Landing, About
├── components/
│   ├── game/        ClueCard, GuessInput, RoundResult, GameOver,
│   │                DailyStats, Countdown
│   ├── layout/      AppShell, BottomNav
│   ├── profile/     RadarChart
│   └── shared/      Loading, Toast, BarChart, InstallPrompt,
│                    ShareButton, DuelNotifications
├── hooks/           useGame, useDaily, useDuel, useDuelHub,
│                    useMissions, useProfile, useRanking
├── stores/          authStore, gameStore, uiStore
└── lib/             supabase, auth, elo, xp, constants,
                     normalize, share, tmdb

supabase/
└── migrations/      016 archivos SQL (schema → security hardening)
```
