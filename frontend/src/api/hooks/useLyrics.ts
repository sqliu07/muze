import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLyrics, searchLyrics, saveLyrics, restoreLyrics, searchLddcCandidates } from '@/api/client'
import type { LyricsSearch, LyricsUpdate } from '@/types/api'
import type { SearchLyricsOptions } from '@/api/client'

export function useLyrics(trackId: number) {
  return useQuery({
    queryKey: ['lyrics', trackId],
    queryFn: () => getLyrics(trackId),
    enabled: trackId > 0,
  })
}

export function useSearchLyrics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      trackId,
      payload,
      options,
    }: {
      trackId: number
      payload: LyricsSearch
      options?: SearchLyricsOptions
    }) => searchLyrics(trackId, payload, options),
    onSuccess: (data, { trackId }) => {
      queryClient.setQueryData(['lyrics', trackId], data)
    },
  })
}

export function useSaveLyrics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ trackId, payload }: { trackId: number; payload: LyricsUpdate }) =>
      saveLyrics(trackId, payload),
    onSuccess: (data, { trackId }) => {
      queryClient.setQueryData(['lyrics', trackId], data)
    },
  })
}

export function useRestoreLyrics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (trackId: number) => restoreLyrics(trackId),
    onSuccess: (data, trackId) => {
      queryClient.setQueryData(['lyrics', trackId], data)
    },
  })
}

export function useSearchLddcCandidates() {
  return useMutation({
    mutationFn: ({
      trackId,
      payload,
      limit,
    }: {
      trackId: number
      payload: LyricsSearch
      limit?: number
    }) => searchLddcCandidates(trackId, payload, limit),
  })
}
