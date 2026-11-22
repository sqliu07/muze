import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyAlbumCover,
  getAlbum,
  getAlbums,
  searchAlbumCoverCandidates,
} from '@/api/client'
import type { AlbumsParams, TrackCoverApply, TrackCoverSearch } from '@/types/api'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function useAlbums(params?: AlbumsParams) {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['albums', source.id, params],
    queryFn: () => getAlbums(params, source.id),
  })
}

export function useAlbum(id: number) {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['album', source.id, id],
    queryFn: () => getAlbum(id, source.id),
    enabled: id > 0,
  })
}

export function useSearchAlbumCoverCandidates() {
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
    }) => searchAlbumCoverCandidates(id, payload, sourceId),
  })
}

export function useApplyAlbumCover() {
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
    }) => applyAlbumCover(id, payload, sourceId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      queryClient.invalidateQueries({ queryKey: ['album', data.source_id ?? source.id, data.id] })
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
    },
  })
}
