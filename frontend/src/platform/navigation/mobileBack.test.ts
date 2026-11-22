import assert from 'node:assert/strict'
import test from 'node:test'
import { handleMobileBack, isLibraryRoot, isPlayerDismissSwipe, mobileParentRoute, type MobileBackEnvironment } from './mobileBack.ts'

function fixture(overrides: Partial<MobileBackEnvironment> = {}) {
  const calls: string[] = []
  const environment: MobileBackEnvironment = {
    dismissOverlay: () => false,
    nowPlayingOpen: false,
    closeNowPlaying: () => calls.push('close-player'),
    searchActive: false,
    clearSearch: () => calls.push('clear-search'),
    pathname: '/albums',
    historyIndex: 0,
    parentRoute: '/albums',
    goBack: () => calls.push('back'),
    goToParent: (route) => calls.push(route),
    minimize: () => calls.push('minimize'),
    ...overrides,
  }
  return { calls, environment }
}

test('Android Back closes an overlay before the player, route or app', () => {
  const { environment, calls } = fixture({ dismissOverlay: () => true, nowPlayingOpen: true, searchActive: true, pathname: '/settings', historyIndex: 2 })
  assert.equal(handleMobileBack(environment), 'overlay')
  assert.deepEqual(calls, [])
})

test('one Back press closes the player while the underlying route and search remain', () => {
  const { environment, calls } = fixture({ nowPlayingOpen: true, searchActive: true, pathname: '/albums/4', historyIndex: 2 })
  assert.equal(handleMobileBack(environment), 'player')
  assert.deepEqual(calls, ['close-player'])
})

test('search consumes Back before leaving its current page', () => {
  const { environment, calls } = fixture({ searchActive: true, pathname: '/settings', historyIndex: 2 })
  assert.equal(handleMobileBack(environment), 'search')
  assert.deepEqual(calls, ['clear-search'])
})

test('detail routes return through actual app history or the parent on a direct launch', () => {
  const fromList = fixture({ pathname: '/albums/4', historyIndex: 1 })
  assert.equal(handleMobileBack(fromList.environment), 'route')
  assert.deepEqual(fromList.calls, ['back'])
  const deepLink = fixture({ pathname: '/playlists/4', parentRoute: '/playlists' })
  assert.equal(handleMobileBack(deepLink.environment), 'route')
  assert.deepEqual(deepLink.calls, ['/playlists'])
  assert.equal(mobileParentRoute('/artists/2'), '/artists')
  assert.equal(mobileParentRoute('/settings', '/tracks'), '/tracks')
})

test('Back from every root minimizes instead of replaying tab history or stopping audio', () => {
  for (const pathname of ['/home', '/tracks', '/albums', '/artists', '/playlists', '/favorites', '/library']) {
    const { environment, calls } = fixture({ pathname, historyIndex: 12 })
    assert.equal(isLibraryRoot(pathname), true)
    assert.equal(handleMobileBack(environment), 'minimize')
    assert.deepEqual(calls, ['minimize'])
  }
})

test('header dismissal rejects taps, upward scrolls and horizontal swipes', () => {
  const start = { x: 200, y: 30 }
  assert.equal(isPlayerDismissSwipe(start, { x: 209, y: 100 }), true)
  assert.equal(isPlayerDismissSwipe(start, { x: 201, y: 50 }), false)
  assert.equal(isPlayerDismissSwipe(start, { x: 201, y: -50 }), false)
  assert.equal(isPlayerDismissSwipe(start, { x: 280, y: 100 }), false)
})
