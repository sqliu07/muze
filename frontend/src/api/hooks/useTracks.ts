import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTracks, getTrack, updateTrack } from '@/api/client'
import type { TracksParams, TrackUpdate } from '@/types/api'

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
