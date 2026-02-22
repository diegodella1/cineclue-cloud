import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export function useMissions() {
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('weekly')
  const user = useAuthStore(s => s.user)

  const loadMissions = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Load missions + progress in parallel
    const [{ data: missionList }, { data: progressList }] = await Promise.all([
      supabase.from('cc_missions').select('*').eq('active', true).order('type').order('id'),
      supabase.from('cc_mission_progress').select('*').eq('user_id', user.id),
    ])

    // Merge
    const merged = (missionList || []).map(m => {
      const weekStart = new Date(Date.now() - (new Date().getDay() - 1) * 86400000)
        .toISOString().split('T')[0]
      const progress = (progressList || []).find(p =>
        p.mission_id === m.id && (
          m.type === 'weekly' ? p.week_start === weekStart : p.week_start === null
        )
      )
      return {
        ...m,
        progress: progress?.progress || 0,
        target: (m.condition?.count) || 1,
        completed: progress?.completed || false,
        completed_at: progress?.completed_at,
      }
    })

    setMissions(merged)
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadMissions()
  }, [loadMissions])

  const weeklyMissions = missions.filter(m => m.type === 'weekly')
  const permanentMissions = missions.filter(m => m.type === 'permanent')

  return {
    missions, weeklyMissions, permanentMissions,
    loading, tab, setTab, loadMissions,
  }
}
