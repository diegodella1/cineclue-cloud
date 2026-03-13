import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

export const usePartyStore = create((set, get) => ({
  // Room state
  room: null,       // { id, code, status, num_rounds, current_round, current_clue, movies, clue_started_at }
  players: [],
  rankings: [],
  playerId: null,
  isHost: false,
  hostDisconnected: false,

  // Game state
  currentClues: [],      // clues revealed so far for current round
  answeredThisRound: false,
  lastAnswerResult: null, // { correct, points, already_answered, first_blood, multiplier }
  answeredPlayerIds: [],  // players who answered correctly this round (host tracks)
  lastFirstBlood: null,   // { player_id, display_name } — ephemeral, cleared on next round
  isDoubleRound: false,   // true when current_round >= num_rounds - 2
  previousRankings: [],   // rankings snapshot from before last fetchRankings
  playerStreaks: {},       // player_id → consecutive correct rounds count

  // Realtime
  channel: null,

  // Actions
  createRoom: async (numRounds = 5, hostUserId = null, autoAdvance = false, maxPlayers = 20) => {
    const { data, error } = await supabase.rpc('cc_party_create_room', {
      p_host_user_id: hostUserId,
      p_num_rounds: numRounds,
      p_auto_advance: autoAdvance,
      p_max_players: maxPlayers,
    })
    if (error) throw error
    set({
      room: { id: data.room_id, code: data.code, status: 'waiting', num_rounds: numRounds, auto_advance: autoAdvance, current_round: 0, current_clue: 0 },
      isHost: true,
      players: [],
      rankings: [],
    })
    get().subscribeToChannel(data.code)
    track('party_created', { num_rounds: numRounds, auto_advance: autoAdvance, max_players: maxPlayers, code: data.code })
    return data
  },

  joinRoom: async (code, displayName, avatar) => {
    const { data, error } = await supabase.rpc('cc_party_join_room', {
      p_code: code,
      p_display_name: displayName,
      p_avatar: avatar,
    })
    if (error) throw error
    const playerId = data.player_id
    set({
      room: { id: data.room_id, code: data.code, status: 'waiting', num_rounds: data.num_rounds, auto_advance: data.auto_advance || false, current_round: 0, current_clue: 0 },
      playerId,
      isHost: false,
    })
    // Persist for reconnect
    try { sessionStorage.setItem('party_player_id', playerId) } catch {}
    get().subscribeToChannel(data.code)
    // Broadcast waits for channel ready automatically
    get().broadcast('player_joined', { player_id: playerId, display_name: displayName, avatar })
    track('party_joined', { code: data.code })
    return data
  },

  startGame: async () => {
    const room = get().room
    if (!room) return
    const { data, error } = await supabase.rpc('cc_party_start_game', { p_room_id: room.id })
    if (error) throw error
    const movies = data.movies
    const firstMovie = movies[0]
    set({
      room: { ...get().room, status: 'playing', movies, current_round: 0, current_clue: 0, clue_started_at: Date.now() },
      currentClues: [firstMovie.clues[0]],
      answeredThisRound: false,
      lastAnswerResult: null,
      answeredPlayerIds: [],
      isDoubleRound: 0 >= movies.length - 2,
      playerStreaks: {},
    })
    return data
  },

  advanceClue: async () => {
    const room = get().room
    if (!room) return
    const { data, error } = await supabase.rpc('cc_party_advance_clue', { p_room_id: room.id })
    if (error) throw error
    if (data.action === 'clue_advanced') {
      const newClueIdx = data.current_clue
      const movie = room.movies[room.current_round]
      const clues = []
      for (let i = 0; i <= newClueIdx; i++) clues.push(movie.clues[i])
      set({
        room: { ...get().room, current_clue: newClueIdx, clue_started_at: Date.now() },
        currentClues: clues,
      })
    }
    return data
  },

  submitAnswer: async (answer, responseTimeMs) => {
    const { room, playerId } = get()
    if (!room || !playerId) return
    const { data, error } = await supabase.rpc('cc_party_submit_answer', {
      p_room_id: room.id,
      p_player_id: playerId,
      p_answer: answer,
      p_response_time_ms: responseTimeMs,
    })
    if (error) throw error
    set({ lastAnswerResult: data })
    if (data.correct) set({ answeredThisRound: true })
    return data
  },

  nextRound: async () => {
    const room = get().room
    if (!room) return
    const { data, error } = await supabase.rpc('cc_party_next_round', { p_room_id: room.id })
    if (error) throw error
    if (data.action === 'next_round') {
      const movie = room.movies[data.current_round]
      set({
        room: { ...get().room, current_round: data.current_round, current_clue: 0, clue_started_at: Date.now() },
        currentClues: [movie.clues[0]],
        answeredThisRound: false,
        lastAnswerResult: null,
        answeredPlayerIds: [],
      })
    } else if (data.action === 'game_finished') {
      set({ room: { ...get().room, status: 'finished' } })
    }
    return data
  },

  fetchRankings: async () => {
    const room = get().room
    if (!room) return
    const { data, error } = await supabase.rpc('cc_party_get_rankings', { p_room_id: room.id })
    if (error) return
    set({ rankings: data || [] })
    return data
  },

  fetchPlayers: async () => {
    const room = get().room
    if (!room) return
    const { data } = await supabase
      .from('cc_party_players')
      .select('id, display_name, avatar, total_score, connected')
      .eq('room_id', room.id)
      .order('created_at')
    set({ players: data || [] })
  },

  // Realtime channel
  channelReady: false,

  subscribeToChannel: (code) => {
    const existing = get().channel
    if (existing) supabase.removeChannel(existing)
    set({ channelReady: false })

    const channel = supabase.channel(`party:${code}`, {
      config: { broadcast: { self: true } },
    })

    channel
      .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
        get().fetchPlayers()
      })
      .on('broadcast', { event: 'game_started' }, ({ payload }) => {
        const movies = payload.movies
        const numRounds = movies.length
        set({
          room: { ...get().room, status: 'playing', movies, current_round: 0, current_clue: 0, clue_started_at: payload.clue_started_at || Date.now() },
          currentClues: [movies[0].clues[0]],
          answeredThisRound: false,
          lastAnswerResult: null,
          answeredPlayerIds: [],
          isDoubleRound: 0 >= numRounds - 2,
          playerStreaks: {},
        })
      })
      .on('broadcast', { event: 'clue_revealed' }, ({ payload }) => {
        const { current_clue, current_round } = payload
        const room = get().room
        if (!room?.movies) return
        const movie = room.movies[current_round]
        const clues = []
        for (let i = 0; i <= current_clue; i++) clues.push(movie.clues[i])
        set({
          room: { ...room, current_clue, clue_started_at: payload.clue_started_at || Date.now() },
          currentClues: clues,
        })
      })
      .on('broadcast', { event: 'player_answered' }, ({ payload }) => {
        get().fetchRankings()
        // Host tracks who answered correctly
        if (payload.correct && payload.player_id) {
          const prev = get().answeredPlayerIds
          if (!prev.includes(payload.player_id)) {
            const updated = [...prev, payload.player_id]
            set({ answeredPlayerIds: updated })
          }
        }
        // First blood
        if (payload.first_blood && payload.player_id) {
          const players = get().players
          const p = players.find(pl => pl.id === payload.player_id)
          set({ lastFirstBlood: { player_id: payload.player_id, display_name: p?.display_name || '???' } })
          setTimeout(() => set({ lastFirstBlood: null }), 3000)
        }
      })
      .on('broadcast', { event: 'ranking_update' }, ({ payload }) => {
        if (payload.rankings) set({ rankings: payload.rankings })
      })
      .on('broadcast', { event: 'round_end' }, ({ payload }) => {
        const room = get().room
        // Save previous rankings for position arrows
        set({ previousRankings: [...get().rankings] })
        if (room) {
          set({
            room: { ...room, _roundEndTitle: payload.title, _roundEndDiff: payload.diff },
          })
        }
        // Update player streaks
        const answered = get().answeredPlayerIds
        const streaks = { ...get().playerStreaks }
        const allPlayerIds = get().players.map(p => p.id)
        for (const pid of allPlayerIds) {
          if (answered.includes(pid)) {
            streaks[pid] = (streaks[pid] || 0) + 1
          } else {
            streaks[pid] = 0
          }
        }
        set({ playerStreaks: streaks })
        get().fetchRankings()
      })
      .on('broadcast', { event: 'next_round' }, ({ payload }) => {
        const room = get().room
        if (!room?.movies) return
        const movie = room.movies[payload.current_round]
        const numRounds = room.movies.length
        set({
          room: { ...room, current_round: payload.current_round, current_clue: 0, clue_started_at: payload.clue_started_at || Date.now(), _roundEndTitle: undefined, _roundEndDiff: undefined },
          currentClues: [movie.clues[0]],
          answeredThisRound: false,
          answeredPlayerIds: [],
          lastAnswerResult: null,
          lastFirstBlood: null,
          isDoubleRound: payload.current_round >= numRounds - 2,
          previousRankings: [],
        })
      })
      .on('broadcast', { event: 'game_finished' }, () => {
        set({ room: { ...get().room, status: 'finished' } })
        get().fetchRankings()
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const hostLeft = leftPresences.some(p => p.role === 'host')
        if (hostLeft && !get().isHost) {
          set({ hostDisconnected: true })
        }
      })
      .subscribe((status) => {
        console.log('[party] channel status:', status)
        if (status === 'SUBSCRIBED') {
          set({ channelReady: true })
          // Track presence after subscribe
          const { isHost, playerId } = get()
          if (isHost) {
            channel.track({ role: 'host' })
          } else if (playerId) {
            channel.track({ role: 'player', player_id: playerId })
          }
        }
      })

    set({ channel, hostDisconnected: false })
  },

  // Broadcast helper — waits for channel to be ready
  broadcast: (event, payload = {}) => {
    const ch = get().channel
    if (!ch) return
    if (get().channelReady) {
      ch.send({ type: 'broadcast', event, payload })
    } else {
      // Retry until ready (max 5s)
      let attempts = 0
      const interval = setInterval(() => {
        attempts++
        if (get().channelReady) {
          clearInterval(interval)
          ch.send({ type: 'broadcast', event, payload })
        } else if (attempts > 50) {
          clearInterval(interval)
          console.warn('[party] broadcast timeout, sending anyway')
          ch.send({ type: 'broadcast', event, payload })
        }
      }, 100)
    }
  },

  // Reconnect for players
  reconnect: async (code) => {
    const savedPlayerId = sessionStorage.getItem('party_player_id')
    if (!savedPlayerId) return false

    // Fetch room by code
    const { data: rooms } = await supabase
      .from('cc_party_rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .in('status', ['waiting', 'playing'])
      .limit(1)
    if (!rooms?.length) return false
    const room = rooms[0]

    // Verify player belongs to room
    const { data: players } = await supabase
      .from('cc_party_players')
      .select('*')
      .eq('id', savedPlayerId)
      .eq('room_id', room.id)
      .limit(1)
    if (!players?.length) return false

    // Restore state
    const currentClues = []
    if (room.movies && room.status === 'playing') {
      const movie = room.movies[room.current_round]
      for (let i = 0; i <= room.current_clue; i++) currentClues.push(movie.clues[i])
    }

    set({
      room: { ...room, clue_started_at: room.clue_started_at ? new Date(room.clue_started_at).getTime() : Date.now() },
      playerId: savedPlayerId,
      isHost: false,
      currentClues,
      answeredThisRound: false,
    })

    get().subscribeToChannel(code.toUpperCase())
    get().fetchPlayers()
    get().fetchRankings()
    return true
  },

  // Cleanup
  reset: () => {
    const ch = get().channel
    if (ch) supabase.removeChannel(ch)
    try { sessionStorage.removeItem('party_player_id') } catch {}
    set({
      room: null, players: [], rankings: [], playerId: null, isHost: false, hostDisconnected: false,
      currentClues: [], answeredThisRound: false, lastAnswerResult: null, answeredPlayerIds: [],
      lastFirstBlood: null, isDoubleRound: false, previousRankings: [], playerStreaks: {},
      channel: null, channelReady: false,
    })
  },
}))
