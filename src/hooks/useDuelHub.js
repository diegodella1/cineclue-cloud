import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useDuelHub(userId) {
  const [duels, setDuels] = useState([])
  const [loadingDuels, setLoadingDuels] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const debounceRef = useRef(null)

  const loadDuels = useCallback(async () => {
    if (!userId) return
    setLoadingDuels(true)
    const { data, error } = await supabase.rpc('cc_get_my_duels', { p_user_id: userId })
    if (!error && data) setDuels(data)
    setLoadingDuels(false)
  }, [userId])

  const searchUsers = useCallback((query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query || query.length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('cc_search_users', {
        p_query: query,
        p_user_id: userId,
      })
      if (!error && data) setSearchResults(data)
      setSearching(false)
    }, 300)
  }, [userId])

  const countPending = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.rpc('cc_count_pending_duels', { p_user_id: userId })
    if (!error && data !== null) setPendingCount(data)
  }, [userId])

  return {
    duels, loadingDuels, loadDuels,
    searchResults, searching, searchUsers, setSearchResults,
    pendingCount, countPending,
  }
}
