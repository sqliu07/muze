import type { TrackOut } from '../../types/api'
import type { ResolvedPlaybackTrack } from '../contracts/playback'

/** Repair local DB identifiers only after the native resolver confirms the stable source key. */
export function mergeResolvedPlaybackTracks(tracks: TrackOut[], value: unknown): TrackOut[] | null {
  if (!Array.isArray(value) || value.length !== tracks.length) return null
  let changed = false
  const merged: TrackOut[] = []
  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index]
    const candidate = value[index] as Partial<ResolvedPlaybackTrack> | null
    if (!candidate || typeof candidate !== 'object' || !Number.isSafeInteger(candidate.id) || candidate.id! <= 0 || typeof candidate.source_id !== 'string' || typeof candidate.playback_url !== 'string') return null
    if (track.source_id !== 'local:android') {
      // The local resolver has no authority over another provider's identity.
      const sameSource = candidate.source_id === track.source_id || (!track.source_id && (candidate.source_id === 'remote:same-origin' || candidate.source_id === 'remote:legacy'))
      if (candidate.id !== track.id || !sameSource || (track.playback_url && candidate.playback_url !== track.playback_url)) return null
      merged.push(track)
      continue
    }
    if (candidate.source_id !== 'local:android' || typeof candidate.local_key !== 'string' || !candidate.local_key.trim() || (track.local_key && candidate.local_key !== track.local_key) || candidate.playback_url !== `muze-native://track/${candidate.id}`) return null
    if (track.id === candidate.id && track.local_key === candidate.local_key && track.playback_url === candidate.playback_url) merged.push(track)
    else {
      changed = true
      merged.push({ ...track, id: candidate.id!, source_id: candidate.source_id, local_key: candidate.local_key, playback_url: candidate.playback_url })
    }
  }
  return changed ? merged : tracks
}

/** A resolver may prune missing nonselected rows, but must retain the requested song. */
export function reconcileResolvedPlaybackQueue(tracks: TrackOut[], index: number, value: unknown, resolvedIndices?: unknown, resolvedIndex?: unknown): { tracks: TrackOut[]; index: number } | null {
  if (!Array.isArray(value)) return null
  const indices = resolvedIndices === undefined ? tracks.map((_, row) => row) : resolvedIndices
  if (!Array.isArray(indices) || indices.length !== value.length) return null
  let previous = -1
  for (const row of indices) {
    if (!Number.isInteger(row) || row <= previous || row >= tracks.length) return null
    previous = row
  }
  if (!Number.isInteger(index) || (tracks.length ? index < 0 || index >= tracks.length : index !== -1)) return null
  const mappedIndex = tracks.length ? indices.indexOf(index) : -1
  if ((tracks.length && mappedIndex < 0) || (resolvedIndex !== undefined && resolvedIndex !== mappedIndex)) return null
  const original = indices.length === tracks.length ? tracks : indices.map((row) => tracks[row])
  const merged = mergeResolvedPlaybackTracks(original, value)
  return merged ? { tracks: merged, index: mappedIndex } : null
}
