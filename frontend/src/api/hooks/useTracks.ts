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

export function useTracks(params?: TracksParams) {
  return useQuery({
    queryKey: ['tracks', params],
    queryFn: () => getTracks(params),
  })
}

export function useTrack(id: number) {
  return useQuery({
    queryKey: ['track', id],
    queryFn: () => getTrack(id),
    enabled: id > 0,
  })
}

export function useUpdateTrack() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TrackUpdate }) =>
      updateTrack(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.setQueryData(['track', data.id], data)
    },
  })
}

export function useSearchTrackCover() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => searchTrackCover(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      queryClient.invalidateQueries({ queryKey: ['artists'] })
      queryClient.setQueryData(['track', data.id], data)
    },
  })
}

export function useSearchTrackCoverCandidates() {
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number
      payload: TrackCoverSearch
    }) => searchTrackCoverCandidates(id, payload),
  })
}

export function useApplyTrackCover() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number
      payload: TrackCoverApply
    }) => applyTrackCover(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      queryClient.invalidateQueries({ queryKey: ['artists'] })
      queryClient.setQueryData(['track', data.id], data)
    },
  })
}
