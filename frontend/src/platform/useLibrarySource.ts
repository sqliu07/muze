import { useSyncExternalStore } from 'react'
import { getActiveLibrarySource, getLibrarySourceId, subscribeLibrarySource } from './library.ts'

export function useLibrarySource() {
  useSyncExternalStore(subscribeLibrarySource, getLibrarySourceId, getLibrarySourceId)
  return getActiveLibrarySource()
}
