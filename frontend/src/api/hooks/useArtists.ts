import { useQuery } from '@tanstack/react-query'
import { getArtists, getArtist } from '@/api/client'

export function useArtists() {
  return useQuery({
    queryKey: ['artists'],
    queryFn: getArtists,
  })
}

export function useArtist(id: number) {
  return useQuery({
    queryKey: ['artist', id],
    queryFn: () => getArtist(id),
    enabled: id > 0,
  })
}
