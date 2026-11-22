import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { PluginListenerHandle } from '@capacitor/core'
import { getRuntimePlatform } from '@/platform/runtime'
import { useUIStore } from '@/store/uiStore'
import { handleMobileBack, isLibraryRoot, mobileParentRoute } from './mobileBack'

/** Radix owns dismissal and focus restoration; a native Back is its Escape. */
function dismissTopOverlay(): boolean {
  const layers = Array.from(document.querySelectorAll<HTMLElement>('[data-mobile-back-layer][data-state="open"]'))
  const layer = layers.reverse().find((element) => element.getClientRects().length > 0)
  if (!layer) return false
  layer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
  return true
}

export function useMobileNavigation(searchActive: boolean, clearSearch: () => void) {
  const location = useLocation()
  const navigate = useNavigate()
  const lastRoot = useRef('/albums')
  const minimize = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (isLibraryRoot(location.pathname)) lastRoot.current = location.pathname
  }, [location.pathname])

  const back = useCallback(() => handleMobileBack({
    dismissOverlay: dismissTopOverlay,
    nowPlayingOpen: useUIStore.getState().nowPlayingOpen,
    closeNowPlaying: () => useUIStore.getState().setNowPlayingOpen(false),
    searchActive,
    clearSearch,
    pathname: location.pathname,
    historyIndex: Number(window.history.state?.idx ?? 0),
    parentRoute: mobileParentRoute(location.pathname, lastRoot.current),
    goBack: () => { void navigate(-1) },
    goToParent: (pathname) => { void navigate(pathname, { replace: true }) },
    minimize: () => minimize.current?.(),
  }), [clearSearch, location.pathname, navigate, searchActive])
  const backRef = useRef(back)
  useLayoutEffect(() => { backRef.current = back }, [back])

  useEffect(() => {
    if (getRuntimePlatform() !== 'android') return
    let disposed = false
    let listener: PluginListenerHandle | undefined
    void import('@capacitor/app').then(async ({ App }) => {
      if (disposed) return
      minimize.current = () => { void App.minimizeApp() }
      const handle = await App.addListener('backButton', () => { backRef.current() })
      if (disposed) await handle.remove()
      else listener = handle
    })
    return () => {
      disposed = true
      minimize.current = null
      void listener?.remove()
    }
  }, [])

  return { back, showBack: !isLibraryRoot(location.pathname) }
}
