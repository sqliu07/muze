export interface TrackKey {
  sourceId: string
  localId: string
}

export interface SourceEntity {
  id: number
  source_id?: string
  local_key?: string
  playback_url?: string
  cover_url?: string
}

export function sourceIdentity(entity: SourceEntity, fallbackSource = 'remote:same-origin'): string {
  return `${entity.source_id ?? fallbackSource}:${entity.local_key ?? entity.id}`
}

export function sameSourceEntity(left: SourceEntity | null, right: SourceEntity | null): boolean {
  return !!left && !!right && sourceIdentity(left) === sourceIdentity(right)
}
