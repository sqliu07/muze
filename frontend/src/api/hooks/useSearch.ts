import { useQuery } from '@tanstack/react-query'
import { searchAll } from '@/api/client'
import { SEARCH_STALE_TIME } from '@/config/app'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function useSearch(q: string, enabled = true) {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['search', source.id, q],
    queryFn: () => searchAll(q, 10, source.id),
    enabled: enabled && q.trim().length > 0,
    staleTime: SEARCH_STALE_TIME,
  })
}
