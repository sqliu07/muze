import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { Script } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import type { TrackOut } from '../types/api.ts'
import { createEqualizerState } from '../lib/equalizer.ts'

type PlayerModule = typeof import('./playerStore.ts')

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

async function loadPlayer(t: { after: (callback: () => void) => void }, persisted?: object): Promise<{ store: PlayerModule['usePlayerStore']; storage: MemoryStorage; browser: EventTarget }> {
  const storage = new MemoryStorage()
  if (persisted) storage.setItem('muze-player', JSON.stringify({ state: persisted, version: 0 }))
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  const browser = Object.assign(new EventTarget(), { localStorage: storage })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
  t.after(() => {
    browser.dispatchEvent(new Event('pagehide'))
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  const result = await build({
    entryPoints: [fileURLToPath(new URL('./playerStore.ts', import.meta.url))], bundle: true,
    alias: { '@': fileURLToPath(new URL('../', import.meta.url)) },
    platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'isolate-browser-seek', setup(builder) {
      // The store's queue and persistence logic is real. The browser transport
      // is intentionally isolated; it is covered by the playback engine tests.
      builder.onResolve({ filter: /^@\/hooks\/useAudio$/ }, () => ({ path: 'seek', namespace: 'test-transport' }))
      builder.onLoad({ filter: /.*/, namespace: 'test-transport' }, () => ({ contents: 'export function seekAudio() {}', loader: 'js' }))
    } }],
  })
  const module = { exports: {} }
  const execute = new Script(`(function(require, module, exports) { ${result.outputFiles[0].text}\n})`).runInThisContext()
  execute(createRequire(import.meta.url), module, module.exports)
  return { store: (module.exports as PlayerModule).usePlayerStore, storage, browser }
}

function track(id: number, sourceId = 'remote:same-origin', localKey?: string): TrackOut {
  return {
    id, source_id: sourceId, local_key: localKey, title: `Song ${id}`, file_path: '',
    artist_id: null, album_id: null, artist: null, album: null, duration: 180,
    bitrate: null, format: 'flac', track_number: null, disc_number: null, year: null,
    genre: null, has_cover: false, play_count: 0, file_missing: false,
    date_added: '2026-09-30', is_favorite: false,
  }
}

test('queue actions keep same-numbered tracks from different libraries distinct', async (t) => {
  const { store } = await loadPlayer(t)
  const remote = track(7, 'remote:home')
  const local = track(7, 'local:windows', 'C:/Music/song.flac')
  store.getState().setQueue([remote, local], 0)
  store.getState().setCurrentTime(55)
  store.getState().playTrack(local)
  assert.equal(store.getState().currentIndex, 1)
  assert.equal(store.getState().queue.length, 2)
  assert.equal(store.getState().currentTime, 0)
  assert.equal(store.getState().playbackRequest, 2)
  store.getState().replaceQueuedTrack({ ...local, title: 'Updated local title' })
  assert.equal(store.getState().queue[0].title, 'Song 7')
  assert.equal(store.getState().queue[1].title, 'Updated local title')
  store.getState().playTrack({ ...local, local_key: 'C:/Other/song.flac' })
  assert.equal(store.getState().queue.length, 3, 'stable local keys must distinguish files even if numeric IDs collide')
  assert.equal(store.getState().currentIndex, 0)
})

test('repeat-one advances playback generation even when the numeric track index stays unchanged', async (t) => {
  const { store } = await loadPlayer(t)
  store.getState().setQueue([track(3)])
  store.getState().setPlayMode('repeat-one')
  store.getState().setCurrentTime(179)
  const before = store.getState().playbackRequest
  store.getState().playNext()
  assert.equal(store.getState().currentIndex, 0)
  assert.equal(store.getState().currentTime, 0)
  assert.equal(store.getState().playbackRequest, before + 1)
  assert.equal(store.getState().isPlaying, true)
  store.getState().setPlayMode('sequential')
  store.getState().playNext()
  assert.equal(store.getState().isPlaying, false)
  assert.equal(store.getState().playbackRequest, before + 1, 'sequential end must stop instead of reloading the final track')
})

test('removing a different queue entry preserves the active song and its position', async (t) => {
  const { store } = await loadPlayer(t)
  store.getState().setQueue([track(1), track(2), track(3)], 1)
  store.getState().setCurrentTime(45)
  store.getState().removeFromQueue(0)
  assert.equal(store.getState().queue[store.getState().currentIndex].id, 2)
  assert.equal(store.getState().currentTime, 45)
  const before = store.getState().playbackRequest
  store.getState().removeFromQueue(9)
  assert.equal(store.getState().playbackRequest, before)
  store.getState().addToQueue(track(4))
  assert.equal(store.getState().currentTime, 45)
  assert.equal(store.getState().queue[store.getState().currentIndex].id, 2)
})

test('removing the active queue entry starts its successor at zero instead of the removed song position', async (t) => {
  const { store } = await loadPlayer(t)
  store.getState().setQueue([track(1), track(2), track(3)], 1)
  store.getState().setCurrentTime(85)
  store.getState().removeFromQueue(1)
  assert.equal(store.getState().queue[store.getState().currentIndex].id, 3)
  assert.equal(store.getState().currentTime, 0)
  store.getState().setCurrentTime(23)
  store.getState().removeFromQueue(1)
  assert.equal(store.getState().queue[store.getState().currentIndex].id, 1)
  assert.equal(store.getState().currentTime, 0)
  store.getState().removeFromQueue(0)
  assert.equal(store.getState().currentIndex, -1)
  assert.equal(store.getState().isPlaying, false)
  assert.equal(store.getState().currentTime, 0)
})

test('persisted queue restores source identity and position while transport remains paused', async (t) => {
  const local = track(8, 'local:android', 'content://media/8')
  const remote = track(8, 'remote:home')
  const { store, storage, browser } = await loadPlayer(t, {
    queue: [local, remote], currentIndex: 1, currentTime: 72, volume: 0.35,
    playMode: 'repeat-all', isPlaying: true, playbackRequest: 900, playbackError: 'old error',
  })
  assert.equal(store.getState().currentIndex, 1)
  assert.equal(store.getState().currentTime, 72)
  assert.equal(store.getState().queue[0].local_key, 'content://media/8')
  assert.equal(store.getState().queue[1].source_id, 'remote:home')
  assert.equal(store.getState().volume, 0.35)
  assert.equal(store.getState().playMode, 'repeat-all')
  assert.equal(store.getState().isPlaying, false)
  assert.equal(store.getState().playbackRequest, 0)
  assert.equal(store.getState().playbackError, null)
  store.getState().setCurrentTime(75)
  browser.dispatchEvent(new Event('pagehide'))
  const saved = JSON.parse(storage.getItem('muze-player')!).state
  assert.equal(saved.currentTime, 75)
  assert.equal(saved.queue[1].source_id, 'remote:home')
  assert.equal('isPlaying' in saved, false)
  assert.equal('playbackRequest' in saved, false)
  assert.equal('playbackError' in saved, false)
})

test('native snapshots update the active index and position without issuing a new queue request', async (t) => {
  const { store } = await loadPlayer(t)
  store.getState().setQueue([track(1), track(2)])
  const generation = store.getState().playbackRequest
  store.getState().applyPlaybackSnapshot({ index: 1, position: 17, duration: 180, isPlaying: true, mode: 'sequential', generation })
  assert.equal(store.getState().currentIndex, 1)
  assert.equal(store.getState().currentTime, 17)
  assert.equal(store.getState().isPlaying, true)
  assert.equal(store.getState().playbackRequest, generation)
  store.getState().applyPlaybackSnapshot({ index: 20, position: -1, duration: 0, isPlaying: false, mode: 'sequential', generation })
  assert.equal(store.getState().currentIndex, 1)
  assert.equal(store.getState().currentTime, 0)
  assert.equal(store.getState().isPlaying, false)
})

test('reconnecting native playback replaces a stale persisted web queue and preserves its generation', async (t) => {
  const { store, storage } = await loadPlayer(t, { queue: [track(3, 'remote:home')], currentIndex: 0, currentTime: 12 })
  const active = track(8, 'local:android', 'content://media/8')
  const queued = track(9, 'local:android', 'content://media/9')
  const equalizer = createEqualizerState('bass', true)
  store.getState().restoreNativePlayback({ tracks: [active, queued], index: 1, position: 73, duration: 180, isPlaying: true, mode: 'repeat-all', generation: 16, equalizer })
  assert.deepEqual(store.getState().queue, [active, queued])
  assert.equal(store.getState().currentIndex, 1)
  assert.equal(store.getState().currentTime, 73)
  assert.equal(store.getState().isPlaying, true)
  assert.equal(store.getState().playMode, 'repeat-all')
  assert.equal(store.getState().playbackRequest, 16)
  assert.deepEqual(JSON.parse(JSON.stringify(store.getState().equalizer)), equalizer)
  const saved = JSON.parse(storage.getItem('muze-player')!).state
  assert.equal(saved.queue[0].source_id, 'local:android')
  assert.equal(saved.currentTime, 73)
  assert.deepEqual(saved.equalizer, equalizer)
})

test('native equalizer restoration without a queue preserves transport and normalizes persisted gains', async (t) => {
  const { store } = await loadPlayer(t)
  store.getState().setQueue([track(4)])
  store.getState().setCurrentTime(12)
  const equalizer = createEqualizerState('treble', true)
  equalizer.preamp = -99
  equalizer.bands[0].gain = 99
  store.getState().restoreNativeEqualizer(equalizer)
  assert.equal(store.getState().equalizer.preamp, -12)
  assert.equal(store.getState().equalizer.bands[0].gain, 12)
  assert.equal(store.getState().queue[0].id, 4)
  assert.equal(store.getState().currentTime, 12)
  assert.equal(store.getState().playbackRequest, 1)
})

test('native canonical identity reconciliation preserves the queue generation, metadata, transport and persisted API id', async (t) => {
  const { store, storage } = await loadPlayer(t)
  const local = { ...track(4, 'local:android', 'media:external:1234'), title: '七百年後', format: 'FLAC', playback_url: 'muze-native://track/4' }
  const remote = { ...track(4, 'remote:home'), playback_url: 'https://nas.example/api/tracks/4/stream' }
  store.getState().setQueue([local, remote])
  store.getState().setCurrentTime(73)
  store.getState().setPlayMode('repeat-all')
  const identities = [{ id: 99, source_id: 'local:android', local_key: local.local_key, playback_url: 'muze-native://track/99' }, { id: 4, source_id: 'remote:home', local_key: '', playback_url: remote.playback_url }]
  const acknowledgement = { index: 0, position: 0, duration: 0, isPlaying: false, mode: 'sequential' as const, generation: 1, resolvedTracks: identities }
  store.getState().applyNativeQueueIdentities(acknowledgement)
  assert.equal(store.getState().queue[store.getState().currentIndex].id, 99, 'lyrics and other track APIs see the native canonical DB id')
  assert.equal(store.getState().queue[0].title, '七百年後')
  assert.equal(store.getState().queue[0].format, 'FLAC')
  assert.equal(store.getState().queue[1], remote)
  assert.equal(store.getState().currentTime, 73)
  assert.equal(store.getState().isPlaying, true)
  assert.equal(store.getState().playMode, 'repeat-all')
  assert.equal(store.getState().playbackRequest, 1)
  const canonical = store.getState().queue
  store.getState().applyNativeQueueIdentities(acknowledgement)
  assert.equal(store.getState().queue, canonical, 'unchanged ACKs do not trigger queue renders')
  store.getState().applyNativeQueueIdentities({ ...acknowledgement, generation: 0 })
  store.getState().applyNativeQueueIdentities({ ...acknowledgement, resolvedTracks: [] })
  assert.equal(store.getState().queue, canonical)
  assert.equal(JSON.parse(storage.getItem('muze-player')!).state.queue[0].id, 99)
})

test('native queue pruning remaps a paused selected song and never rolls back a newer native auto-advanced selection', async (t) => {
  const { store } = await loadPlayer(t)
  const tracks = [track(1, 'local:android', 'missing-file'), track(2, 'local:android', 'selected-file'), track(3, 'local:android', 'next-file')]
  const acknowledgement = { index: 0, position: 0, duration: 0, isPlaying: false, mode: 'sequential' as const, generation: 1, requestedIndex: 1, resolvedTracks: [{ id: 22, source_id: 'local:android', local_key: 'selected-file', playback_url: 'muze-native://track/22' }, { id: 33, source_id: 'local:android', local_key: 'next-file', playback_url: 'muze-native://track/33' }], resolvedIndices: [1, 2], resolvedIndex: 0, resolvedCurrentIndex: 0 }
  store.getState().setQueue(tracks, 1)
  store.getState().setCurrentTime(42)
  store.getState().setPlaying(false)
  store.getState().applyNativeQueueIdentities(acknowledgement)
  assert.equal(store.getState().currentIndex, 0)
  assert.equal(store.getState().queue[0].id, 22)
  assert.equal(store.getState().currentTime, 42)
  assert.equal(store.getState().isPlaying, false)
  assert.equal(store.getState().playbackRequest, 1)
  store.getState().setQueue(tracks, 1)
  store.getState().applyPlaybackSnapshot({ index: 1, position: 58, duration: 180, isPlaying: true, mode: 'sequential', generation: 2 })
  store.getState().applyNativeQueueIdentities({ ...acknowledgement, generation: 2, resolvedCurrentIndex: 1 })
  assert.equal(store.getState().currentIndex, 1)
  assert.equal(store.getState().queue[1].id, 33)
  assert.equal(store.getState().currentTime, 58)
  assert.equal(store.getState().isPlaying, true)
  assert.equal(store.getState().playbackRequest, 2)
  const canonical = store.getState().queue
  store.getState().applyNativeQueueIdentities({ ...acknowledgement, generation: 2, resolvedCurrentIndex: 100 })
  assert.equal(store.getState().queue, canonical)
})
