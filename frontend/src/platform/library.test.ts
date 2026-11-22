import assert from 'node:assert/strict'
import test from 'node:test'
import { remoteApi, requestLibrary, selectLibrarySource, addRemoteLibrarySource, getTrackMediaUrl, trackIdentity, RemoteLibraryProvider } from './library.ts'
import type { TrackListOut, TrackOut } from '../types/api.ts'

const fixture = {
  id: 7, title: 'Offline song', duration: 180, format: 'flac',
  file_path: '/server/music/song.flac', has_cover: true,
} as TrackOut

test('remote provider keeps HTTP methods, parameters and bodies compatible with the NAS API', async () => {
  const previous = remoteApi.defaults.adapter
  remoteApi.defaults.adapter = async (config) => {
    assert.equal(config.method, 'patch')
    assert.equal(config.baseURL, 'https://music.example.com/api')
    assert.deepEqual(config.params, { refresh: 1 })
    assert.deepEqual(JSON.parse(config.data), { offset_ms: -350 })
    return { data: { offset_ms: -350 }, status: 200, statusText: 'OK', headers: {}, config }
  }
  try {
    const source = addRemoteLibrarySource('NAS', 'https://music.example.com')
    const data = await new RemoteLibraryProvider(source).request('PATCH', '/lyrics/7/offset', { refresh: 1 }, { offset_ms: -350 })
    assert.deepEqual(data, { offset_ms: -350 })
  } finally { remoteApi.defaults.adapter = previous }
})

test('an in-flight library response and queued playback retain their provider after source switching', async () => {
  const previous = remoteApi.defaults.adapter
  const source = addRemoteLibrarySource('NAS', 'https://second.example.com')
  let finish!: () => void
  remoteApi.defaults.adapter = (config) => new Promise((resolve) => {
    finish = () => resolve({ data: { items: [fixture], total: 1, page: 1, limit: 20 }, status: 200, statusText: 'OK', headers: {}, config })
  })
  try {
    selectLibrarySource(source.id)
    const pending = requestLibrary<TrackListOut>('GET', '/tracks')
    selectLibrarySource('remote:same-origin')
    finish()
    const result = await pending
    const track = result.items[0]
    assert.equal(track.source_id, source.id)
    assert.equal(getTrackMediaUrl(track), 'https://second.example.com/api/tracks/7/stream')
    assert.equal(track.cover_url, 'https://second.example.com/api/tracks/7/cover')
    assert.notEqual(trackIdentity(track), trackIdentity({ ...track, source_id: 'local:windows' }))
  } finally { remoteApi.defaults.adapter = previous; selectLibrarySource('remote:same-origin') }
})

test('Windows provider calls the native contract and only exposes opaque media references', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: unknown) => {
          assert.equal(command, 'library_request')
          assert.deepEqual(args, { method: 'GET', path: '/tracks', query: { limit: 10 }, body: null })
          return {
            items: [{ ...fixture, local_key: 'opaque-file-key', file_path: 'C:\\Users\\listener\\Music\\song.flac', album: { id: 5, total_tracks: 1, cover_path: 'C:\\cache\\cover.jpg' } }],
            total: 1, page: 1, limit: 10,
          }
        },
      },
    },
  })
  try {
    const data = await requestLibrary<TrackListOut>('GET', '/tracks', { limit: 10 }, undefined, 'local:windows')
    const track = data.items[0]
    assert.equal(track.file_path, '')
    assert.equal(track.album?.cover_path, 'cover:5')
    assert.equal(track.album?.cover_url, 'http://muze-media.localhost/album/5')
    assert.equal(getTrackMediaUrl(track), 'http://muze-media.localhost/track/7')
    assert.equal(trackIdentity(track), 'local:windows:opaque-file-key')
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
