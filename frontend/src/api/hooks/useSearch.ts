import { useQuery } from '@tanstack/react-query'
import { searchAll } from '@/api/client'
import { SEARCH_STALE_TIME } from '@/config/app'

export function useSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => searchAll(q),
    enabled: enabled && q.trim().length > 0,
    staleTime: SEARCH_STALE_TIME,
  })
}
