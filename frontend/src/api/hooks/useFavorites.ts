import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFavorites, addFavorite, removeFavorite } from '@/api/client'

export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: getFavorites,
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ trackId, isFavorite }: { trackId: number; isFavorite: boolean }) =>
      isFavorite ? removeFavorite(trackId) : addFavorite(trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      queryClient.invalidateQueries({ queryKey: ['tracks'] })
    },
  })
}
