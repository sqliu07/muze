import { useQuery } from '@tanstack/react-query'
import { getArtists, getArtist } from '@/api/client'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function useArtists() {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['artists', source.id],
    queryFn: () => getArtists(source.id),
  })
}

export function useArtist(id: number) {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['artist', source.id, id],
    queryFn: () => getArtist(id, source.id),
    enabled: id > 0,
  })
}
