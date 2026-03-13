import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { getEloRank } from '../lib/constants'
import { invalidateLevels, loadLevels } from '../lib/xp'
import AppShell from '../components/layout/AppShell'
import Loading from '../components/shared/Loading'
import BarChart from '../components/shared/BarChart'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'movies', label: 'Películas' },
  { id: 'users', label: 'Usuarios' },
  { id: 'games', label: 'Partidas' },
  { id: 'daily', label: 'Peli del Día' },
  { id: 'missions', label: 'Misiones' },
  { id: 'levels', label: 'Niveles' },
  { id: 'party', label: 'Party' },
]

export default function Admin() {
  const [isAdmin, setIsAdmin] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    if (!user) { setIsAdmin(false); setLoading(false); return }
    supabase.from('cc_admins').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[admin] check failed:', error)
        setIsAdmin(!!data)
        setLoading(false)
      })
      .catch((e) => {
        console.error('[admin] check error:', e)
        setIsAdmin(false)
        setLoading(false)
      })
  }, [user])

  if (loading) return <AppShell><Loading /></AppShell>
  if (!isAdmin) {
    return (
      <AppShell>
        <div className="min-h-dvh flex items-center justify-center">
          <p className="text-error">No tenés permisos de admin</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-4">
        <h1 className="font-serif text-2xl text-gold">Admin Panel</h1>

        {/* Tab bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-gold text-dark' : 'bg-dark-card text-text-secondary border border-dark-border'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'movies' && <MoviesTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'games' && <GamesTab />}
        {tab === 'daily' && <DailyTab />}
        {tab === 'missions' && <MissionsTab />}
        {tab === 'levels' && <LevelsTab />}
        {tab === 'party' && <PartyTab />}
      </div>
    </AppShell>
  )
}

/* ============================================================ */
/* DASHBOARD TAB                                                 */
/* ============================================================ */
function DashboardTab() {
  const [overview, setOverview] = useState(null)
  const [gamesPerDay, setGamesPerDay] = useState([])
  const [eloDistro, setEloDistro] = useState([])
  const [scoreDistro, setScoreDistro] = useState(null)
  const [streakDistro, setStreakDistro] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.rpc('cc_admin_overview'),
      supabase.rpc('cc_admin_games_per_day', { p_days: 14 }),
      supabase.rpc('cc_admin_elo_distribution'),
      supabase.rpc('cc_admin_score_distribution'),
      supabase.rpc('cc_admin_streak_distribution'),
    ]).then(([ov, gpd, elo, score, streak]) => {
      setOverview(ov.data)
      setGamesPerDay(gpd.data || [])
      setEloDistro(elo.data || [])
      setScoreDistro(score.data)
      setStreakDistro(streak.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <Loading />

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* KPI cards */}
      {overview && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <KPI label="Usuarios" value={overview.total_users} />
            <KPI label="Partidas" value={overview.total_games} />
            <KPI label="PuntEmes prom." value={overview.avg_elo} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <KPI label="Hoy partidas" value={overview.today_games} accent />
            <KPI label="Hoy DAU" value={overview.today_active_users} accent />
            <KPI label="Daily hoy" value={overview.daily_played_today} accent />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <KPI label="Semana partidas" value={overview.week_games} />
            <KPI label="Semana WAU" value={overview.week_active_users} />
            <KPI label="Score prom." value={overview.avg_score} />
          </div>
        </>
      )}

      {/* Games per day */}
      <Card title="Partidas / día (14d)">
        <BarChart data={gamesPerDay} labelKey="date" valueKey="total" secondaryKey="unique_users" secondaryColor="#4caf50" height={160} />
        <div className="flex gap-4 mt-2">
          <Legend color="#d4af37" label="Partidas" />
          <Legend color="#4caf50" label="Usuarios" />
        </div>
      </Card>

      {/* ELO distribution */}
      <Card title="Distribución PuntEmes">
        <BarChart data={eloDistro} labelKey="bucket" valueKey="count" height={140} />
      </Card>

      {/* Score distribution - Solo */}
      {scoreDistro?.solo?.length > 0 && (
        <Card title="Distribución de scores (Solo)">
          <BarChart data={scoreDistro.solo} labelKey="score" valueKey="count" height={120} />
        </Card>
      )}

      {/* Streak distribution */}
      {streakDistro.length > 0 && (
        <Card title="Distribución de streaks">
          <BarChart data={streakDistro} labelKey="streak" valueKey="count" color="#e53935" height={120} />
        </Card>
      )}
    </div>
  )
}

/* ============================================================ */
/* MOVIES TAB                                                    */
/* ============================================================ */
function MoviesTab() {
  const [movies, setMovies] = useState([])
  const [movieStats, setMovieStats] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('stats') // 'stats' | 'list'

  useEffect(() => {
    Promise.all([
      supabase.from('cc_movies').select('*').order('id'),
      supabase.rpc('cc_admin_movie_stats'),
    ]).then(([mv, ms]) => {
      setMovies(mv.data || [])
      setMovieStats(ms.data || [])
      setLoading(false)
    })
  }, [])

  const reload = async () => {
    const [mv, ms] = await Promise.all([
      supabase.from('cc_movies').select('*').order('id'),
      supabase.rpc('cc_admin_movie_stats'),
    ])
    setMovies(mv.data || [])
    setMovieStats(ms.data || [])
  }

  const saveMovie = async (movie) => {
    const payload = { ...movie, clues: movie.clues, alt: movie.alt, genres: movie.genres }
    if (movie.id) {
      await supabase.from('cc_movies').update(payload).eq('id', movie.id)
    } else {
      await supabase.from('cc_movies').insert(payload)
    }
    setEditing(null)
    await reload()
  }

  if (loading) return <Loading />

  if (editing) {
    return <MovieForm movie={editing} onSave={saveMovie} onCancel={() => setEditing(null)} />
  }

  const diffColors = { 'fácil': 'text-success', 'medio': 'text-gold', 'difícil': 'text-error' }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <SmallTab active={view === 'stats'} onClick={() => setView('stats')}>Rendimiento</SmallTab>
          <SmallTab active={view === 'list'} onClick={() => setView('list')}>Gestión</SmallTab>
        </div>
        <button
          onClick={() => setEditing({ title: '', alt: [], diff: 'medio', lb: '', clues: ['', '', '', '', ''], genres: [], country: '', decade: 2020, director: '', active: true })}
          className="bg-gold text-dark text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-gold-light transition-colors"
        >
          + Nueva
        </button>
      </div>

      {view === 'stats' ? (
        /* Hit rate table */
        <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
          <div className="grid grid-cols-[1fr_50px_50px_50px_40px] gap-1 px-3 py-2 text-[10px] text-text-secondary border-b border-dark-border font-mono">
            <span>Película</span>
            <span className="text-right">Jugadas</span>
            <span className="text-right">Tasa</span>
            <span className="text-right">Pista</span>
            <span className="text-right">Dif</span>
          </div>
          {movieStats.map((m, i) => (
            <div key={m.movie_id} className={`grid grid-cols-[1fr_50px_50px_50px_40px] gap-1 px-3 py-2 text-xs ${i > 0 ? 'border-t border-dark-border/50' : ''} ${!m.active ? 'opacity-40' : ''}`}>
              <span className="truncate">{m.title}</span>
              <span className="text-right font-mono text-text-secondary">{m.times_played}</span>
              <span className={`text-right font-mono ${m.hit_rate >= 70 ? 'text-success' : m.hit_rate >= 40 ? 'text-gold' : 'text-error'}`}>
                {m.hit_rate}%
              </span>
              <span className="text-right font-mono text-text-secondary">{m.avg_clue > 0 ? m.avg_clue : '-'}</span>
              <span className={`text-right font-mono ${diffColors[m.diff]}`}>{m.diff[0].toUpperCase()}</span>
            </div>
          ))}
        </div>
      ) : (
        /* CRUD list */
        <div className="space-y-2">
          {movies.map(m => (
            <div key={m.id} className={`flex items-center justify-between bg-dark-card border border-dark-border rounded-lg px-3 py-2.5 ${!m.active ? 'opacity-40' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{m.title}</p>
                <p className="text-[10px] text-text-secondary">{m.diff} · {m.country} · {m.decade} · {m.director}</p>
              </div>
              <div className="flex gap-2 ml-2">
                <button onClick={() => setEditing({ ...m })} className="text-[10px] text-gold hover:underline">Editar</button>
                {m.active && (
                  <button onClick={async () => { if (confirm('Desactivar?')) { await supabase.from('cc_movies').update({ active: false }).eq('id', m.id); reload() } }} className="text-[10px] text-error hover:underline">Off</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============================================================ */
/* USERS TAB                                                     */
/* ============================================================ */
function UsersTab() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [sort, setSort] = useState('created_at')
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(null)

  const load = useCallback(async (sortBy) => {
    setLoading(true)
    const { data } = await supabase.rpc('cc_admin_users', { p_limit: 100, p_offset: 0, p_sort: sortBy })
    if (data) { setUsers(data.users || []); setTotal(data.total) }
    setLoading(false)
  }, [])

  useEffect(() => { load(sort) }, [sort, load])

  const toggleAdmin = async (userId, isAdmin) => {
    const action = isAdmin ? 'Quitar admin' : 'Hacer admin'
    if (!confirm(`${action} a este usuario?`)) return
    setToggling(userId)
    const { error } = await supabase.rpc('cc_toggle_admin', { p_user_id: userId })
    if (error) { alert(error.message) }
    else { await load(sort) }
    setToggling(null)
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{total} usuarios</p>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="bg-dark-card border border-dark-border rounded-lg px-2 py-1 text-xs text-white"
        >
          <option value="created_at">Recientes</option>
          <option value="elo">PuntEmes</option>
          <option value="games">Partidas</option>
          <option value="xp">XP</option>
        </select>
      </div>

      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        {users.map((u, i) => {
          const rank = getEloRank(u.elo)
          return (
            <div key={u.id} className={`px-3 py-2.5 ${i > 0 ? 'border-t border-dark-border/50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">
                    {u.display_name} <span className="text-text-secondary font-normal">@{u.username}</span>
                    {u.is_admin && <span className="ml-1.5 text-[10px] bg-gold/20 text-gold px-1.5 py-0.5 rounded">admin</span>}
                  </p>
                  <div className="flex gap-3 text-[10px] text-text-secondary mt-0.5">
                    <span>{rank.icon} {u.elo} PuntEmes</span>
                    <span>Nv {u.level}</span>
                    <span>{u.games_played} juegos</span>
                    <span>{u.total_score} pts</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <div className="text-right text-[10px] text-text-secondary">
                    <p>Racha: {u.streak_current} ({u.streak_best} best)</p>
                    <p>{u.last_played ? timeAgo(u.last_played) : 'Nunca jugó'}</p>
                  </div>
                  <button
                    onClick={() => toggleAdmin(u.id, u.is_admin)}
                    disabled={toggling === u.id}
                    className={`text-[10px] px-2 py-1 rounded transition-colors ${
                      u.is_admin
                        ? 'border border-error/40 text-error hover:bg-error/10'
                        : 'border border-dark-border text-text-secondary hover:text-gold hover:border-gold/40'
                    } disabled:opacity-40`}
                    title={u.is_admin ? 'Quitar admin' : 'Hacer admin'}
                  >
                    {toggling === u.id ? '...' : u.is_admin ? 'Quitar' : 'Admin'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================ */
/* GAMES TAB (Recent games log)                                  */
/* ============================================================ */
function GamesTab() {
  const [games, setGames] = useState([])
  const [retention, setRetention] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.rpc('cc_admin_recent_games', { p_limit: 50 }),
      supabase.rpc('cc_admin_retention', { p_days: 14 }),
    ]).then(([g, r]) => {
      setGames(g.data || [])
      setRetention(r.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <Loading />

  const modeColors = { solo: 'text-gold', daily: 'text-success', duel_local: 'text-purple-400' }

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Retention chart */}
      <Card title="Actividad diaria (14d)">
        <BarChart data={retention} labelKey="date" valueKey="total_active" secondaryKey="new_users" secondaryColor="#4caf50" height={140} />
        <div className="flex gap-4 mt-2">
          <Legend color="#d4af37" label="Activos" />
          <Legend color="#4caf50" label="Nuevos" />
        </div>
      </Card>

      {/* Recent games */}
      <h3 className="text-sm font-bold">Últimas 50 partidas</h3>
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        {games.map((g, i) => (
          <div key={g.game_id} className={`px-3 py-2 ${i > 0 ? 'border-t border-dark-border/50' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-bold">{g.display_name}</span>
                  <span className="text-text-secondary"> @{g.username}</span>
                </p>
              </div>
              <span className={`text-[10px] font-mono ${modeColors[g.mode] || 'text-white'}`}>{g.mode}</span>
              <span className="text-xs font-mono text-gold ml-2 w-14 text-right">{g.total_score}/{g.max_possible}</span>
              <span className={`text-[10px] font-mono ml-2 w-12 text-right ${g.elo_delta >= 0 ? 'text-success' : 'text-error'}`}>
                {g.elo_delta >= 0 ? '+' : ''}{g.elo_delta}
              </span>
            </div>
            <p className="text-[10px] text-text-secondary">{timeAgo(g.played_at)}</p>
          </div>
        ))}
        {games.length === 0 && <p className="text-text-secondary text-xs text-center py-6">Sin partidas</p>}
      </div>
    </div>
  )
}

/* ============================================================ */
/* DAILY TAB (Peli del día schedule)                             */
/* ============================================================ */
function DailyTab() {
  const [schedule, setSchedule] = useState([])
  const [movies, setMovies] = useState([])
  const [scheduleMovieId, setScheduleMovieId] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.rpc('cc_admin_daily_schedule', { p_days: 14 }),
      supabase.from('cc_movies').select('id,title,diff').eq('active', true).order('title'),
    ]).then(([s, m]) => {
      setSchedule(s.data || [])
      setMovies(m.data || [])
      setLoading(false)
    })
  }, [])

  const handleSchedule = async () => {
    if (!scheduleMovieId || !scheduleDate) return
    await supabase.rpc('cc_admin_schedule_daily', { p_movie_id: parseInt(scheduleMovieId), p_date: scheduleDate })
    const { data } = await supabase.rpc('cc_admin_daily_schedule', { p_days: 14 })
    setSchedule(data || [])
    setScheduleMovieId('')
    setScheduleDate('')
  }

  const triggerSchedule = async () => {
    await supabase.rpc('cc_schedule_daily_movie')
    const { data } = await supabase.rpc('cc_admin_daily_schedule', { p_days: 14 })
    setSchedule(data || [])
  }

  if (loading) return <Loading />

  const diffColors = { 'fácil': 'text-success', 'medio': 'text-gold', 'difícil': 'text-error' }
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Manual schedule */}
      <Card title="Programar manualmente">
        <div className="space-y-2">
          <select
            value={scheduleMovieId}
            onChange={e => setScheduleMovieId(e.target.value)}
            className="w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-xs text-white"
          >
            <option value="">Elegir película...</option>
            {movies.map(m => (
              <option key={m.id} value={m.id}>{m.title} ({m.diff})</option>
            ))}
          </select>
          <input
            type="date"
            value={scheduleDate}
            onChange={e => setScheduleDate(e.target.value)}
            min={today}
            className="w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-xs text-white"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSchedule}
              disabled={!scheduleMovieId || !scheduleDate}
              className="flex-1 bg-gold text-dark text-xs font-bold py-2 rounded-lg hover:bg-gold-light transition-colors disabled:opacity-40"
            >
              Programar
            </button>
            <button
              onClick={triggerSchedule}
              className="flex-1 border border-dark-border text-text-secondary text-xs py-2 rounded-lg hover:text-white transition-colors"
            >
              Auto-generar mañana
            </button>
          </div>
        </div>
      </Card>

      {/* Schedule list */}
      <h3 className="text-sm font-bold">Programación</h3>
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        {schedule.map((s, i) => {
          const isToday = s.date === today
          const isPast = s.date < today
          return (
            <div key={s.date} className={`flex items-center justify-between px-3 py-2.5 ${i > 0 ? 'border-t border-dark-border/50' : ''} ${isPast ? 'opacity-50' : ''}`}>
              <div>
                <p className={`text-xs font-mono ${isToday ? 'text-gold font-bold' : 'text-white'}`}>
                  {s.date} {isToday ? '(HOY)' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold">{s.title}</p>
                <p className={`text-[10px] font-mono ${diffColors[s.diff]}`}>{s.diff}</p>
              </div>
            </div>
          )
        })}
        {schedule.length === 0 && <p className="text-text-secondary text-xs text-center py-6">Sin programación</p>}
      </div>
    </div>
  )
}

/* ============================================================ */
/* MISSIONS TAB                                                  */
/* ============================================================ */
function MissionsTab() {
  const [missionStats, setMissionStats] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc('cc_admin_mission_stats').then(({ data }) => {
      setMissionStats(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <Loading />

  return (
    <div className="space-y-4 animate-fadeIn">
      <h3 className="text-sm font-bold">Tasa de completado por misión</h3>
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        <div className="grid grid-cols-[1fr_60px_60px_60px] gap-1 px-3 py-2 text-[10px] text-text-secondary border-b border-dark-border font-mono">
          <span>Misión</span>
          <span className="text-right">Iniciadas</span>
          <span className="text-right">Completas</span>
          <span className="text-right">Tasa</span>
        </div>
        {missionStats.map((m, i) => (
          <div key={m.id} className={`grid grid-cols-[1fr_60px_60px_60px] gap-1 px-3 py-2.5 ${i > 0 ? 'border-t border-dark-border/50' : ''}`}>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{m.title}</p>
              <p className="text-[10px] text-text-secondary">{m.type}</p>
            </div>
            <span className="text-right text-xs font-mono text-text-secondary">{m.total_started}</span>
            <span className="text-right text-xs font-mono text-gold">{m.total_completed}</span>
            <span className={`text-right text-xs font-mono ${m.completion_rate >= 50 ? 'text-success' : m.completion_rate > 0 ? 'text-gold' : 'text-text-secondary'}`}>
              {m.completion_rate}%
            </span>
          </div>
        ))}
        {missionStats.length === 0 && <p className="text-text-secondary text-xs text-center py-6">Sin datos</p>}
      </div>
    </div>
  )
}

/* ============================================================ */
/* LEVELS TAB                                                    */
/* ============================================================ */
function LevelsTab() {
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | level object | { level: '', name: '', icon: '🎬', min_xp: '' } for new

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.rpc('cc_admin_get_levels')
    setLevels(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = async (form) => {
    const { error } = await supabase.rpc('cc_admin_upsert_level', {
      p_level: parseInt(form.level),
      p_name: form.name,
      p_icon: form.icon,
      p_min_xp: parseInt(form.min_xp),
    })
    if (error) { alert(error.message); return }
    setEditing(null)
    invalidateLevels()
    loadLevels()
    await load()
  }

  const handleDelete = async (lvl) => {
    if (lvl === 1) { alert('No se puede borrar el nivel 1'); return }
    if (!confirm(`Eliminar nivel ${lvl}?`)) return
    const { error } = await supabase.rpc('cc_admin_delete_level', { p_level: lvl })
    if (error) { alert(error.message); return }
    invalidateLevels()
    loadLevels()
    await load()
  }

  if (loading) return <Loading />

  if (editing) {
    return <LevelForm level={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex justify-between items-center">
        <p className="text-sm text-text-secondary">{levels.length} niveles</p>
        <button
          onClick={() => setEditing({ level: levels.length + 1, name: '', icon: '🎬', min_xp: '' })}
          className="bg-gold text-dark text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-gold-light transition-colors"
        >
          + Nuevo
        </button>
      </div>

      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        <div className="grid grid-cols-[40px_30px_1fr_60px_50px_50px] gap-1 px-3 py-2 text-[10px] text-text-secondary border-b border-dark-border font-mono">
          <span>Nv</span>
          <span></span>
          <span>Nombre</span>
          <span className="text-right">XP min</span>
          <span className="text-right">Users</span>
          <span></span>
        </div>
        {levels.map((l, i) => (
          <div key={l.level} className={`grid grid-cols-[40px_30px_1fr_60px_50px_50px] gap-1 px-3 py-2 items-center ${i > 0 ? 'border-t border-dark-border/50' : ''}`}>
            <span className="text-xs font-mono text-gold">{l.level}</span>
            <span className="text-sm">{l.icon}</span>
            <span className="text-xs truncate">{l.name}</span>
            <span className="text-right text-xs font-mono text-text-secondary">{l.min_xp.toLocaleString()}</span>
            <span className="text-right text-xs font-mono text-text-secondary">{l.user_count}</span>
            <div className="flex gap-1.5 justify-end">
              <button onClick={() => setEditing({ ...l })} className="text-[10px] text-gold hover:underline">Ed</button>
              {l.level !== 1 && (
                <button onClick={() => handleDelete(l.level)} className="text-[10px] text-error hover:underline">X</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LevelForm({ level, onSave, onCancel }) {
  const [form, setForm] = useState({
    level: level.level || '',
    name: level.name || '',
    icon: level.icon || '🎬',
    min_xp: level.min_xp ?? '',
  })
  const isNew = !level.name

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.level || !form.name || form.min_xp === '') return
    onSave(form)
  }

  const inputClass = 'w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-text-secondary focus:outline-none focus:border-gold'
  const labelClass = 'text-xs text-text-secondary mb-1 block'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fadeIn">
      <h2 className="font-serif text-xl text-gold">{isNew ? 'Nuevo' : 'Editar'} Nivel</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Nivel #</label>
          <input className={inputClass} type="number" min="1" value={form.level} onChange={e => update('level', e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>XP mínimo</label>
          <input className={inputClass} type="number" min="0" value={form.min_xp} onChange={e => update('min_xp', e.target.value)} required />
        </div>
      </div>

      <div>
        <label className={labelClass}>Nombre</label>
        <input className={inputClass} value={form.name} onChange={e => update('name', e.target.value)} placeholder="Ej: Cinéfilo" required />
      </div>

      <div>
        <label className={labelClass}>Ícono (emoji)</label>
        <input className={inputClass} value={form.icon} onChange={e => update('icon', e.target.value)} required />
      </div>

      <div className="flex gap-3">
        <button type="submit" className="flex-1 bg-gold text-dark font-bold py-3 rounded-lg hover:bg-gold-light transition-colors">
          Guardar
        </button>
        <button type="button" onClick={onCancel} className="flex-1 border border-dark-border text-text-secondary py-3 rounded-lg hover:text-white transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  )
}

/* ============================================================ */
/* PARTY TAB                                                     */
/* ============================================================ */
function PartyTab() {
  const [metrics, setMetrics] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.rpc('cc_admin_party_metrics', { p_days: 30 }),
      supabase.from('cc_party_rooms').select('id, code, status, num_rounds, created_at, finished_at').order('created_at', { ascending: false }).limit(30),
    ]).then(async ([metricsRes, roomsRes]) => {
      const rawMetrics = metricsRes.data || []
      setMetrics(rawMetrics)

      // Enrich rooms with player count
      const roomData = roomsRes.data || []
      const enriched = await Promise.all(roomData.map(async (r) => {
        const { count } = await supabase.from('cc_party_players').select('*', { count: 'exact', head: true }).eq('room_id', r.id)
        return { ...r, player_count: count || 0 }
      }))
      setRooms(enriched)
      setLoading(false)
    })
  }, [])

  if (loading) return <Loading />

  // Aggregate today's metrics
  const today = new Date().toISOString().split('T')[0]
  const todayMetric = Array.isArray(metrics) ? metrics.find(m => m.day === today) : null
  const totalRooms = Array.isArray(metrics) ? metrics.reduce((s, m) => s + (m.rooms_created || 0), 0) : 0
  const totalCompleted = Array.isArray(metrics) ? metrics.reduce((s, m) => s + (m.rooms_completed || 0), 0) : 0
  const completionRate = totalRooms > 0 ? Math.round((totalCompleted / totalRooms) * 100) : 0
  const avgPlayers = Array.isArray(metrics) && metrics.length > 0
    ? (metrics.reduce((s, m) => s + parseFloat(m.avg_players || 0), 0) / metrics.length).toFixed(1)
    : '0'

  const statusColors = { waiting: 'text-gold', playing: 'text-success', finished: 'text-text-secondary', expired: 'text-error' }

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <KPI label="Salas hoy" value={todayMetric?.rooms_created || 0} accent />
        <KPI label="Tasa completado" value={`${completionRate}%`} />
        <KPI label="Jugadores prom." value={avgPlayers} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <KPI label="Salas total (30d)" value={totalRooms} />
        <KPI label="Completadas" value={totalCompleted} />
        <KPI label="Hoy completadas" value={todayMetric?.rooms_completed || 0} accent />
      </div>

      {/* Recent rooms */}
      <h3 className="text-sm font-bold">Salas recientes</h3>
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        <div className="grid grid-cols-[60px_70px_50px_50px_1fr] gap-1 px-3 py-2 text-[10px] text-text-secondary border-b border-dark-border font-mono">
          <span>Código</span>
          <span>Estado</span>
          <span className="text-right">Rondas</span>
          <span className="text-right">Players</span>
          <span className="text-right">Fecha</span>
        </div>
        {rooms.map((r, i) => (
          <div key={r.id} className={`grid grid-cols-[60px_70px_50px_50px_1fr] gap-1 px-3 py-2 text-xs ${i > 0 ? 'border-t border-dark-border/50' : ''}`}>
            <span className="font-mono text-gold">{r.code}</span>
            <span className={`font-mono ${statusColors[r.status] || 'text-white'}`}>{r.status}</span>
            <span className="text-right font-mono text-text-secondary">{r.num_rounds}</span>
            <span className="text-right font-mono text-text-secondary">{r.player_count}</span>
            <span className="text-right text-text-secondary">{timeAgo(r.created_at)}</span>
          </div>
        ))}
        {rooms.length === 0 && <p className="text-text-secondary text-xs text-center py-6">Sin salas</p>}
      </div>
    </div>
  )
}

/* ============================================================ */
/* SHARED COMPONENTS                                             */
/* ============================================================ */
function KPI({ label, value, accent }) {
  return (
    <div className={`bg-dark-card border rounded-xl p-2.5 text-center ${accent ? 'border-gold/20' : 'border-dark-border'}`}>
      <p className={`text-xl font-mono ${accent ? 'text-gold' : 'text-white'}`}>{value}</p>
      <p className="text-[10px] text-text-secondary">{label}</p>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-gold">{title}</h3>
      {children}
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-text-secondary">{label}</span>
    </div>
  )
}

function SmallTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
        active ? 'bg-gold/20 text-gold' : 'text-text-secondary hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return `Hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `Hace ${days}d`
}

/* ============================================================ */
/* MOVIE FORM (kept from before)                                 */
/* ============================================================ */
function MovieForm({ movie, onSave, onCancel }) {
  const [form, setForm] = useState({
    ...movie,
    alt: Array.isArray(movie.alt) ? movie.alt.join(', ') : '',
    genres: Array.isArray(movie.genres) ? movie.genres.join(', ') : '',
    clues: Array.isArray(movie.clues) ? [...movie.clues] : ['', '', '', '', ''],
  })

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const updateClue = (i, value) => {
    const clues = [...form.clues]
    clues[i] = value
    setForm(f => ({ ...f, clues }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...movie,
      title: form.title,
      alt: form.alt ? form.alt.split(',').map(s => s.trim()).filter(Boolean) : [],
      diff: form.diff,
      lb: form.lb,
      clues: form.clues,
      genres: form.genres ? form.genres.split(',').map(s => s.trim()).filter(Boolean) : [],
      country: form.country,
      decade: parseInt(form.decade) || 2020,
      director: form.director,
      active: form.active,
    })
  }

  const inputClass = 'w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-text-secondary focus:outline-none focus:border-gold'
  const labelClass = 'text-xs text-text-secondary mb-1 block'

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-fadeIn">
      <h2 className="font-serif text-xl text-gold">{movie.id ? 'Editar' : 'Nueva'} Película</h2>

      <div>
        <label className={labelClass}>Título</label>
        <input className={inputClass} value={form.title} onChange={e => update('title', e.target.value)} required />
      </div>

      <div>
        <label className={labelClass}>Alternativas (separadas por coma)</label>
        <input className={inputClass} value={form.alt} onChange={e => update('alt', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Dificultad</label>
          <select className={inputClass} value={form.diff} onChange={e => update('diff', e.target.value)}>
            <option value="fácil">Fácil</option>
            <option value="medio">Medio</option>
            <option value="difícil">Difícil</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Slug Letterboxd</label>
          <input className={inputClass} value={form.lb} onChange={e => update('lb', e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>País</label>
          <input className={inputClass} value={form.country} onChange={e => update('country', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Década</label>
          <input className={inputClass} type="number" value={form.decade} onChange={e => update('decade', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Director</label>
          <input className={inputClass} value={form.director} onChange={e => update('director', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Géneros (separados por coma)</label>
        <input className={inputClass} value={form.genres} onChange={e => update('genres', e.target.value)} />
      </div>

      {['Emojis', 'Dato oscuro', 'Dato revelador', 'Frase icónica', 'Sinopsis'].map((label, i) => (
        <div key={i}>
          <label className={labelClass}>Pista {i + 1}: {label}</label>
          <textarea
            className={`${inputClass} min-h-[60px]`}
            value={form.clues[i]}
            onChange={e => updateClue(i, e.target.value)}
            required
          />
        </div>
      ))}

      <div className="flex gap-3">
        <button type="submit" className="flex-1 bg-gold text-dark font-bold py-3 rounded-lg hover:bg-gold-light transition-colors">
          Guardar
        </button>
        <button type="button" onClick={onCancel} className="flex-1 border border-dark-border text-text-secondary py-3 rounded-lg hover:text-white transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  )
}
