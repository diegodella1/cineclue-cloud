# CineClue

Trivia de cine con identidad. Adiviná películas a partir de pistas progresivas, competí en rankings semanales y completá misiones.

## Stack

- **Frontend**: React + Vite + Tailwind CSS v4 + React Router v6 + Zustand
- **Backend**: Supabase self-hosted (PostgreSQL + Auth + RLS)
- **Deploy**: Docker (nginx) en Raspberry Pi 5
- **Acceso público**: Tailscale Funnel

## Modos de juego

- **Solo** — 5 películas al azar, 5 pistas progresivas cada una. Más temprano adivinás, más puntos
- **Peli del Día** — Una película por día, todos juegan la misma. Cron automático a las 03:00 UTC
- **Duelo Local** — 2 jugadores en el mismo dispositivo, turnos alternados

## Progresión

- **ELO** — Rating que sube/baja según dificultad y rendimiento
- **XP + Niveles** — Experiencia acumulada con niveles progresivos
- **Streaks** — Racha de días consecutivos jugando
- **Ranking semanal** — Se resetea los lunes, mejores pasan al Hall of Fame
- **Misiones** — Semanales y permanentes con recompensas de XP
- **Badges** — Logros desbloqueables por streaks y achievements

## Auth

- Email/password
- Google OAuth (via Supabase GoTrue)

## PWA

Instalable como app en iOS, Android y desktop. Banner automático de instalación.

## Admin Panel

Accesible en `/cineclue/admin` para usuarios con rol admin.

- **Dashboard** — KPIs, partidas/día, distribución ELO/scores/streaks
- **Películas** — CRUD completo + estadísticas de rendimiento (hit rate, pista promedio)
- **Usuarios** — Lista con sorting, toggle admin desde la UI
- **Partidas** — Log de últimas 50 partidas + retención diaria
- **Peli del Día** — Programación manual + auto-generación
- **Misiones** — Tasa de completado por misión

## Setup

### Requisitos

- Docker
- Supabase self-hosted (PostgreSQL con pg_cron)

### Variables de entorno

```env
VITE_SUPABASE_URL=http://<supabase-host>:54321
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Migrations

Aplicar en orden:

```bash
for f in supabase/migrations/*.sql; do
  sudo docker exec -i supabase-db psql -U supabase_admin -d postgres < "$f"
done
```

### Build y deploy

```bash
docker build -t cineclue .
docker run -d --name cineclue -p 3100:80 --restart unless-stopped cineclue
```

La app queda en `http://localhost:3100/cineclue/`.

### Primer admin

Después del primer registro, promover manualmente:

```sql
INSERT INTO cc_admins (user_id)
SELECT id FROM cc_profiles WHERE username = '<tu-username>';
```

Después se pueden agregar más admins desde el panel.

## Estructura del proyecto

```
src/
  components/
    game/        — ClueCard, GuessInput, RoundResult, GameOver, DailyStats, Countdown
    layout/      — AppShell, BottomNav
    profile/     — RadarChart
    shared/      — Loading, Toast, BarChart, InstallPrompt
  hooks/         — useGame, useDaily, useDuel, useMissions, useProfile, useRanking
  lib/           — supabase, auth, constants, elo, xp, normalize, share
  pages/         — Auth, Onboarding, Home, SoloGame, DailyGame, DuelSetup, DuelGame,
                   Ranking, Missions, Profile, PublicProfile, Admin, Landing
  stores/        — authStore, gameStore, uiStore
supabase/
  migrations/    — 010 archivos SQL (schema, functions, seeds, cron, progression,
                   ranking, missions, profiles, analytics, admin toggle)
```

## Acceso

- **LAN**: `http://192.168.1.14:3100/cineclue/`
- **Público**: `https://raspberrypi.tailfe9ba0.ts.net/cineclue/`
