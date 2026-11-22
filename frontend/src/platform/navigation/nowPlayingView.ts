export interface NowPlayingView {
  lyricsVisible: boolean
  queueOpen: boolean
}

type NowPlayingViewAction =
  | { type: 'toggle-lyrics' }
  | { type: 'queue-open-changed'; open: boolean }

export function createNowPlayingView(narrowViewport: boolean): NowPlayingView {
  return { lyricsVisible: !narrowViewport, queueOpen: false }
}

/** The queue is an overlay, never a third player view or a playback command. */
export function nowPlayingViewReducer(state: NowPlayingView, action: NowPlayingViewAction): NowPlayingView {
  if (action.type === 'toggle-lyrics') return { ...state, lyricsVisible: !state.lyricsVisible }
  return { ...state, queueOpen: action.open }
}

interface PlayerShortcutTarget {
  tagName: string
  isContentEditable: boolean
  closest(selector: string): unknown
}

export function canHandlePlayerShortcut(target: PlayerShortcutTarget | null, defaultPrevented: boolean): boolean {
  if (defaultPrevented) return false
  if (!target) return true
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return false
  return !target.closest('[data-mobile-back-layer][data-state="open"]')
}
