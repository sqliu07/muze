const ROOT_ROUTES = new Set(['/home', '/tracks', '/albums', '/artists', '/playlists', '/favorites', '/library'])

export function isLibraryRoot(pathname: string): boolean {
  return ROOT_ROUTES.has(pathname)
}

export function mobileParentRoute(pathname: string, lastRoot = '/albums'): string {
  for (const parent of ['/albums', '/artists', '/playlists']) {
    if (pathname.startsWith(`${parent}/`)) return parent
  }
  return isLibraryRoot(lastRoot) ? lastRoot : '/albums'
}

export interface MobileBackEnvironment {
  dismissOverlay(): boolean
  nowPlayingOpen: boolean
  closeNowPlaying(): void
  searchActive: boolean
  clearSearch(): void
  pathname: string
  historyIndex: number
  parentRoute: string
  goBack(): void
  goToParent(pathname: string): void
  minimize(): void
}

export type MobileBackResult = 'overlay' | 'player' | 'search' | 'route' | 'minimize'

/** One press closes only the top visible layer, leaving playback untouched. */
export function handleMobileBack(environment: MobileBackEnvironment): MobileBackResult {
  if (environment.dismissOverlay()) return 'overlay'
  if (environment.nowPlayingOpen) {
    environment.closeNowPlaying()
    return 'player'
  }
  if (environment.searchActive) {
    environment.clearSearch()
    return 'search'
  }
  if (!isLibraryRoot(environment.pathname)) {
    if (environment.historyIndex > 0) environment.goBack()
    else environment.goToParent(environment.parentRoute)
    return 'route'
  }
  environment.minimize()
  return 'minimize'
}

export interface SwipePoint {
  x: number
  y: number
}

/** Only an intentional downward pull on the player header dismisses it. */
export function isPlayerDismissSwipe(start: SwipePoint, end: SwipePoint): boolean {
  const vertical = end.y - start.y
  return vertical >= 64 && vertical > Math.abs(end.x - start.x) * 1.5
}
