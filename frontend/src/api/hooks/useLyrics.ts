import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLyrics, searchLyrics, saveLyrics, restoreLyrics, searchLddcCandidates, translateLyrics, updateLyricsOffset } from '@/api/client'
import type { LyricsOut, LyricsSearch, LyricsUpdate } from '@/types/api'
import type { SearchLyricsOptions } from '@/api/client'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function useLyrics(trackId: number, sourceId?: string) {
  const selected = useLibrarySource()
  const source = sourceId ?? selected.id
  return useQuery({ queryKey: ['lyrics', source, trackId], queryFn: () => getLyrics(trackId, source), enabled: trackId > 0 })
}
export function useSearchLyrics() {
  const cache = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ trackId, payload, options, sourceId = source.id }: { trackId: number; payload: LyricsSearch; options?: SearchLyricsOptions; sourceId?: string }) => searchLyrics(trackId, payload, options, sourceId),
    onSuccess: (data, variables) => cache.setQueryData(['lyrics', data.source_id ?? variables.sourceId ?? source.id, variables.trackId], data),
  })
}
export function useSaveLyrics() {
  const cache = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ trackId, payload, sourceId = source.id }: { trackId: number; payload: LyricsUpdate; sourceId?: string }) => saveLyrics(trackId, payload, sourceId),
    onSuccess: (data, variables) => cache.setQueryData(['lyrics', data.source_id ?? variables.sourceId ?? source.id, variables.trackId], data),
  })
}
export function useRestoreLyrics() {
  const cache = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: (input: number | { trackId: number; sourceId?: string }) => restoreLyrics(typeof input === 'number' ? input : input.trackId, typeof input === 'number' ? source.id : input.sourceId ?? source.id),
    onSuccess: (data, input) => cache.setQueryData(['lyrics', data.source_id ?? (typeof input === 'number' ? source.id : input.sourceId ?? source.id), typeof input === 'number' ? input : input.trackId], data),
  })
}
export function useUpdateLyricsOffset() {
  const cache = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ trackId, offsetMs, sourceId = source.id }: { trackId: number; offsetMs: number; sourceId?: string }) => updateLyricsOffset(trackId, offsetMs, sourceId),
    onMutate: async ({ trackId, offsetMs, sourceId = source.id }) => {
      const queryKey = ['lyrics', sourceId, trackId]
      await cache.cancelQueries({ queryKey })
      const previous = cache.getQueryData<LyricsOut>(queryKey)
      if (previous) cache.setQueryData(queryKey, { ...previous, offset_ms: offsetMs })
      return { previous, queryKey }
    },
    onError: (_error, _variables, context) => { if (context?.previous) cache.setQueryData(context.queryKey, context.previous) },
    onSuccess: (data, variables) => cache.setQueryData(['lyrics', data.source_id ?? variables.sourceId ?? source.id, variables.trackId], data),
  })
}
export function useSearchLddcCandidates() {
  const source = useLibrarySource()
  return useMutation({ mutationFn: ({ trackId, payload, limit, sourceId = source.id }: { trackId: number; payload: LyricsSearch; limit?: number; sourceId?: string }) => searchLddcCandidates(trackId, payload, limit, sourceId) })
}
export function useTranslateLyrics() {
  const cache = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ trackId, force, sourceId = source.id }: { trackId: number; force?: boolean; sourceId?: string }) => translateLyrics(trackId, force, sourceId),
    onSuccess: (data, variables) => cache.setQueryData(['lyrics', data.source_id ?? variables.sourceId ?? source.id, variables.trackId], data),
  })
}
