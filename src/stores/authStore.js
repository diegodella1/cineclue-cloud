import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  session: null,
  loading: true,
  pendingDuels: 0,
  setPendingDuels: (n) => set({ pendingDuels: n }),

  init: () => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        set({ session })
        return
      }

      if (session?.user) {
        set({ session, user: session.user })
        try {
          const [profileRes, duelsRes] = await Promise.all([
            supabase.from('cc_profiles').select('*').eq('id', session.user.id).single(),
            supabase.rpc('cc_count_pending_duels', { p_user_id: session.user.id }),
          ])
          set({ profile: profileRes.data, pendingDuels: duelsRes.data || 0 })
        } catch (e) {
          console.error('Profile fetch failed:', e)
        }
      } else {
        set({ session: null, user: null, profile: null, pendingDuels: 0 })
      }

      if (get().loading) set({ loading: false })
    })

    // Safety fallback — if no auth event fires in 5s, stop loading
    setTimeout(() => {
      if (get().loading) set({ loading: false })
    }, 5000)
  },

  fetchProfile: async (userId) => {
    const [profileRes, duelsRes] = await Promise.all([
      supabase.from('cc_profiles').select('*').eq('id', userId).single(),
      supabase.rpc('cc_count_pending_duels', { p_user_id: userId }),
    ])
    set({
      profile: profileRes.data,
      pendingDuels: duelsRes.data || 0,
    })
  },

  updateProfile: async (updates) => {
    const user = get().user
    if (!user) return { data: null, error: { message: 'No user' } }
    const { data, error } = await supabase
      .from('cc_profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (!error) set({ profile: data })
    return { data, error }
  },

  needsOnboarding: () => {
    const profile = get().profile
    if (!profile) return false
    return profile.username.startsWith('user_')
  },
}))
