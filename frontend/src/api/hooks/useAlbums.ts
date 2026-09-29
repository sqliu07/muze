import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyAlbumCover,
  getAlbum,
  getAlbums,
  searchAlbumCoverCandidates,
} from '@/api/client'
import type { AlbumsParams, TrackCoverApply, TrackCoverSearch } from '@/types/api'

export function useAlbums(params?: AlbumsParams) {
  return useQuery({
    queryKey: ['albums', params],
    queryFn: () => getAlbums(params),
  })
}

export function useAlbum(id: number) {
  return useQuery({
    queryKey: ['album', id],
    queryFn: () => getAlbum(id),
    enabled: id > 0,
  })
}

export function useSearchAlbumCoverCandidates() {
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number
      payload: TrackCoverSearch
    }) => searchAlbumCoverCandidates(id, payload),
  })
}

export function useApplyAlbumCover() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number
      payload: TrackCoverApply
    }) => applyAlbumCover(id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      queryClient.invalidateQueries({ queryKey: ['album', data.id] })
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
    },
  })
}
