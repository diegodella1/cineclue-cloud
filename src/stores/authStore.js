import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  session: null,
  loading: true,
  profileLoaded: false,
  pendingDuels: 0,
  setPendingDuels: (n) => set({ pendingDuels: n }),

  init: () => {
    const loadProfile = async (session) => {
      try {
        console.log('[auth] fetching profile...')
        const profileRes = await supabase
          .from('cc_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        console.log('[auth] profile result:', profileRes.error || 'ok')

        let pendingDuels = 0
        const duelsRes = await supabase.rpc('cc_count_pending_duels', { p_user_id: session.user.id })
        if (!duelsRes.error) pendingDuels = duelsRes.data || 0

        set({ profile: profileRes.data, profileLoaded: true, pendingDuels })
        console.log('[auth] profile loaded:', !!profileRes.data)
      } catch (e) {
        console.error('[auth] fetch failed:', e)
        set({ profileLoaded: true })
      }
    }

    // NOTE: callback is NOT async — avoids holding the supabase-js
    // navigator.locks while awaiting REST calls (causes deadlock in v2.64+)
    supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth]', event, session?.user?.email || 'no user')
      if (event === 'TOKEN_REFRESHED') {
        set({ session })
        return
      }

      if (session?.user) {
        set({ session, user: session.user, loading: false })
        if (event === 'SIGNED_IN') track('user_login', { provider: session.user.app_metadata?.provider || 'email' })
        loadProfile(session)
      } else {
        set({ session: null, user: null, profile: null, profileLoaded: false, pendingDuels: 0, loading: false })
      }
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
