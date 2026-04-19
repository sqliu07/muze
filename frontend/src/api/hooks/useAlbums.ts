import { useQuery } from '@tanstack/react-query'
import { getAlbums, getAlbum } from '@/api/client'
import type { AlbumsParams } from '@/types/api'

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
