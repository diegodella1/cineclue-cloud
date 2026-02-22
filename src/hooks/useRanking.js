import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

const RANKING_POLL_INTERVAL = 30_000

export function useRanking() {
  const [ranking, setRanking] = useState([])
  const [userPosition, setUserPosition] = useState(null)
  const [weekStart, setWeekStart] = useState(null)
  const [total, setTotal] = useState(0)
  const [hallOfFame, setHallOfFame] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('current')
  const user = useAuthStore(s => s.user)
  const intervalRef = useRef(null)

  const loadRanking = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('cc_get_ranking', {
      p_user_id: user?.id || null,
      p_limit: 50,
      p_offset: 0,
    })
    if (!error && data) {
      setRanking(data.ranking || [])
      setUserPosition(data.user_position)
      setWeekStart(data.week_start)
      setTotal(data.total)
    }
    setLoading(false)
  }, [user])

  const loadHallOfFame = useCallback(async () => {
    const { data } = await supabase
      .from('cc_hall_of_fame')
      .select('*, cc_profiles(username, display_name)')
      .order('week_start', { ascending: false })
      .order('position', { ascending: true })
      .limit(30)
    setHallOfFame(data || [])
  }, [])

  useEffect(() => {
    loadRanking()
    loadHallOfFame()

    // Poll every 30s instead of Realtime (saves ~30KB from bundle)
    intervalRef.current = setInterval(loadRanking, RANKING_POLL_INTERVAL)

    return () => clearInterval(intervalRef.current)
  }, [loadRanking, loadHallOfFame])

  return {
    ranking, userPosition, weekStart, total,
    hallOfFame, loading, tab, setTab, loadRanking,
  }
}
