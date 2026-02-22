import { create } from 'zustand'

export const useUiStore = create((set) => ({
  toast: null,
  loading: false,

  showToast: (message, type = 'info') => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 3000)
  },

  setLoading: (loading) => set({ loading }),
}))
