import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProfile() {
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadPublicProfile = useCallback(async (username) => {
    setLoading(true)
    const { data, error } = await supabase.rpc('cc_get_public_profile', { p_username: username })
    if (!error && data) {
      setProfileData(data)
    }
    setLoading(false)
  }, [])

  // Derive specialties and weaknesses
  const getSpecialties = (stats) => {
    if (!stats) return []
    return stats
      .filter(s => s.category_type === 'genre' && s.played >= 3 && s.rate >= 70)
      .map(s => s.category_value)
  }

  const getWeaknesses = (stats) => {
    if (!stats) return []
    return stats
      .filter(s => s.category_type === 'genre' && s.played >= 3 && s.rate < 30)
      .map(s => s.category_value)
  }

  const getFavoriteDecade = (stats) => {
    if (!stats) return null
    const decades = stats
      .filter(s => s.category_type === 'decade' && s.played >= 2)
      .sort((a, b) => b.rate - a.rate)
    return decades.length > 0 ? decades[0].category_value : null
  }

  const getGenreStats = (stats) => {
    if (!stats) return []
    return stats
      .filter(s => s.category_type === 'genre')
      .sort((a, b) => b.played - a.played)
      .slice(0, 6)
  }

  return {
    profileData, loading,
    loadPublicProfile,
    getSpecialties, getWeaknesses, getFavoriteDecade, getGenreStats,
  }
}
