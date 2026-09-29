import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLyrics, searchLyrics, saveLyrics, restoreLyrics, searchLddcCandidates, translateLyrics, updateLyricsOffset } from '@/api/client'
import type { LyricsOut, LyricsSearch, LyricsUpdate } from '@/types/api'
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

export function useUpdateLyricsOffset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ trackId, offsetMs }: { trackId: number; offsetMs: number }) =>
      updateLyricsOffset(trackId, offsetMs),
    onMutate: async ({ trackId, offsetMs }) => {
      const queryKey = ['lyrics', trackId]
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<LyricsOut>(queryKey)
      if (previous) {
        queryClient.setQueryData(queryKey, { ...previous, offset_ms: offsetMs })
      }
      return { previous }
    },
    onError: (_error, { trackId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['lyrics', trackId], context.previous)
      }
    },
    onSuccess: (data, { trackId }) => {
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

export function useTranslateLyrics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ trackId, force }: { trackId: number; force?: boolean }) => translateLyrics(trackId, force),
    onSuccess: (data, { trackId }) => {
      queryClient.setQueryData(['lyrics', trackId], data)
    },
  })
}
