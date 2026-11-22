import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeResolvedPlaybackTracks, reconcileResolvedPlaybackQueue } from './nativeQueueAck.ts'
import type { TrackOut } from '../../types/api.ts'
import type { ResolvedPlaybackTrack } from '../contracts/playback.ts'

function track(id: number, source = 'local:android', localKey: string | undefined = 'media:external:1234'): TrackOut {
  return { id, source_id: source, local_key: localKey, playback_url: source === 'local:android' ? `muze-native://track/${id}` : `https://nas.example/api/tracks/${id}/stream`, title: '七百年後', artist_id: 2, artist: { id: 2, name: '陳奕迅', cover_path: null }, album_id: null, album: null, file_path: '', format: 'FLAC', duration: 262, bitrate: 900000, track_number: 3, disc_number: 1, year: 2009, genre: 'Pop', has_cover: true, cover_url: 'https://nas.example/cover.jpg', play_count: 3, file_missing: false, date_added: '2026-10-05', is_favorite: true }
}

const local = (id = 99): ResolvedPlaybackTrack => ({ id, source_id: 'local:android', local_key: 'media:external:1234', playback_url: `muze-native://track/${id}` })

test('resolved local DB ids replace only the confirmed identity and preserve all caller metadata', () => {
  const original = track(4)
  const merged = mergeResolvedPlaybackTracks([original], [local()])!
  assert.equal(merged[0].id, 99)
  assert.equal(merged[0].playback_url, 'muze-native://track/99')
  assert.deepEqual({ ...merged[0], id: original.id, playback_url: original.playback_url }, original)
  assert.equal(merged[0].artist, original.artist)
  assert.equal(merged[0].format, 'FLAC')
})

test('mixed NAS identities and optional source keys are not rewritten by the Android resolver', () => {
  const remote = track(4, 'remote:home', undefined)
  delete remote.local_key
  const tracks = [track(4), remote]
  const merged = mergeResolvedPlaybackTracks(tracks, [local(), { id: 4, source_id: 'remote:home', local_key: '', playback_url: remote.playback_url }])!
  assert.equal(merged[0].id, 99)
  assert.equal(merged[1], remote)
  assert.equal(merged[1].local_key, undefined)
  const legacy = track(4, 'remote:legacy')
  delete legacy.source_id
  delete legacy.local_key
  const legacyQueue = [legacy]
  assert.equal(mergeResolvedPlaybackTracks(legacyQueue, [{ id: 4, source_id: 'remote:legacy', playback_url: legacy.playback_url }]), legacyQueue, 'native legacy-source labeling cannot rewrite a caller NAS identity')
})

test('resolved queue identities reject truncated, reordered, cross-source or malformed acknowledgements atomically', () => {
  const tracks = [track(4)]
  const invalid: unknown[] = [undefined, [], [local(), local()], [null], [{ ...local(), id: 0 }], [{ ...local(), id: Number.NaN }], [{ ...local(), id: 1.2 }], [{ ...local(), local_key: 'different-file' }], [{ ...local(), local_key: '' }], [{ ...local(), source_id: 'remote:home' }], [{ ...local(), playback_url: 'content://media/untrusted/99' }], [{ ...local(), playback_url: 'muze-native://track/4' }]]
  invalid.forEach((value) => assert.equal(mergeResolvedPlaybackTracks(tracks, value), null))
  const remote = track(5, 'remote:home')
  assert.equal(mergeResolvedPlaybackTracks([remote], [local()]), null)
  assert.equal(mergeResolvedPlaybackTracks([remote], [{ id: 5, source_id: 'remote:home', playback_url: 'https://other.example/song' }]), null)
})

test('legacy Android tracks can accept a trusted stable key but unchanged identities retain queue references', () => {
  const legacy = track(4)
  delete legacy.local_key
  assert.equal(mergeResolvedPlaybackTracks([legacy], [local(4)])?.[0].local_key, 'media:external:1234')
  const tracks = [track(99)]
  assert.equal(mergeResolvedPlaybackTracks(tracks, [local()]), tracks)
})

test('pruning missing nonselected rows retains the requested song and remaps its index without replacing metadata', () => {
  const tracks = [track(4), { ...track(5), local_key: 'second-file' }, { ...track(6), local_key: 'third-file' }]
  const identities = [{ id: 55, source_id: 'local:android', local_key: 'second-file', playback_url: 'muze-native://track/55' }, { id: 66, source_id: 'local:android', local_key: 'third-file', playback_url: 'muze-native://track/66' }]
  const resolved = reconcileResolvedPlaybackQueue(tracks, 1, identities, [1, 2], 0)!
  assert.equal(resolved.index, 0)
  assert.equal(resolved.tracks.length, 2)
  assert.equal(resolved.tracks[0].id, 55)
  assert.equal(resolved.tracks[0].title, tracks[1].title)
  assert.equal(resolved.tracks[1].format, 'FLAC')
  assert.equal(reconcileResolvedPlaybackQueue(tracks, 0, identities, [1, 2], 0), null, 'the selected missing track cannot silently become a different song')
  for (const indices of [[1, 1], [2, 1], [-1, 2], [1, 3], [1], ['1', 2]]) assert.equal(reconcileResolvedPlaybackQueue(tracks, 1, identities, indices, 0), null)
  assert.equal(reconcileResolvedPlaybackQueue(tracks, 1, identities, [1, 2], 1), null)
})
