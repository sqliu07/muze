import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getSettings,
  testDeepSeekConnection,
  updateSettings,
  type AppSettings,
} from '@/api/client'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function useSettings() {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['settings', source.id],
    queryFn: () => getSettings(source.id),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: (payload: Partial<AppSettings>) => updateSettings(payload, source.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

export function useTestDeepSeekConnection() {
  const source = useLibrarySource()
  return useMutation({ mutationFn: () => testDeepSeekConnection(source.id) })
}
