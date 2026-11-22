export type LibraryMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type LibraryQuery = Record<string, string | number | boolean | null | undefined>
export type LibraryMediaKind = 'track' | 'cover' | 'album' | 'artist'

export interface LibrarySource {
  id: string
  kind: 'local' | 'remote'
  name: string
  platform?: 'windows' | 'android'
  baseUrl?: string
}

export interface LibraryProvider {
  readonly source: LibrarySource
  request<T>(method: LibraryMethod, path: string, query?: LibraryQuery, body?: unknown): Promise<T>
  mediaUrl(id: number, kind: LibraryMediaKind): string
}

export interface LibraryPermission {
  status: 'granted' | 'prompt' | 'denied' | 'limited' | 'unavailable'
  can_request?: boolean
}

export interface LibraryScanProgress {
  running: boolean
  processed: number
  total: number
  added: number
  updated: number
  errors: number
}
