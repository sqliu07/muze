import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  applyTrackCover,
  getTracks,
  getTrack,
  searchTrackCover,
  searchTrackCoverCandidates,
  updateTrack,
} from '@/api/client'
import type { TrackCoverApply, TrackCoverSearch, TracksParams, TrackUpdate } from '@/types/api'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function useTracks(params?: TracksParams) {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['tracks', source.id, params],
    queryFn: () => getTracks(params, source.id),
  })
}

export function useTrack(id: number) {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['track', source.id, id],
    queryFn: () => getTrack(id, source.id),
    enabled: id > 0,
  })
}

export function useUpdateTrack() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TrackUpdate }) =>
      updateTrack(id, payload, source.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.setQueryData(['track', data.source_id ?? source.id, data.id], data)
    },
  })
}

export function useSearchTrackCover() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: (input: number | { id: number; sourceId?: string }) => searchTrackCover(typeof input === 'number' ? input : input.id, typeof input === 'number' ? source.id : input.sourceId ?? source.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      queryClient.invalidateQueries({ queryKey: ['artists'] })
      queryClient.setQueryData(['track', data.source_id ?? source.id, data.id], data)
    },
  })
}

export function useSearchTrackCoverCandidates() {
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({
      id,
      payload,
      sourceId = source.id,
    }: {
      id: number
      payload: TrackCoverSearch
      sourceId?: string
    }) => searchTrackCoverCandidates(id, payload, sourceId),
  })
}

export function useApplyTrackCover() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({
      id,
      payload,
      sourceId = source.id,
    }: {
      id: number
      payload: TrackCoverApply
      sourceId?: string
    }) => applyTrackCover(id, payload, sourceId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      queryClient.invalidateQueries({ queryKey: ['artists'] })
      queryClient.setQueryData(['track', data.source_id ?? source.id, data.id], data)
    },
  })
}
