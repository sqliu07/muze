import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFavorites, addFavorite, removeFavorite } from '@/api/client'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function useFavorites() {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['favorites', source.id],
    queryFn: () => getFavorites(source.id),
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ trackId, isFavorite, sourceId = source.id }: { trackId: number; isFavorite: boolean; sourceId?: string }) =>
      isFavorite ? removeFavorite(trackId, sourceId) : addFavorite(trackId, sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
    },
  })
}
