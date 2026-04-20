import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type ThemeName, applyTheme } from '@/lib/themes'

interface UIState {
  theme: ThemeName
  sidebarOpen: boolean
  nowPlayingOpen: boolean
  setTheme: (theme: ThemeName) => void
  setSidebarOpen: (open: boolean) => void
  setNowPlayingOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarOpen: true,
      nowPlayingOpen: false,
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setNowPlayingOpen: (open) => set({ nowPlayingOpen: open }),
    }),
    {
      name: 'muze-ui',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme)
        }
      },
    }
  )
)
