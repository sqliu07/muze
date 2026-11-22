import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requestLibrary } from '@/platform/library'
import { useLibrarySource } from '@/platform/useLibrarySource'
import type { LibraryPermission } from '@/platform/contracts/library'
import type { TrackListOut } from '@/types/api'

export function LocalLibraryNotice() {
  const source = useLibrarySource()
  const { data, isError } = useQuery({
    queryKey: ['local-library-status', source.id],
    enabled: source.kind === 'local',
    retry: false,
    queryFn: async () => {
      const permission = await requestLibrary<LibraryPermission>('GET', '/library/permission', undefined, undefined, source.id)
      if (permission.status !== 'granted' && permission.status !== 'limited') return { permission, total: 0 }
      const tracks = await requestLibrary<TrackListOut>('GET', '/tracks', { limit: 1 }, undefined, source.id)
      return { permission, total: tracks.total }
    },
  })
  if (source.kind !== 'local' || (!data && !isError) || (data && data.total > 0)) return null
  const denied = data?.permission.status !== 'granted' && data?.permission.status !== 'limited'
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm" role="status">
      <p className="min-w-0 flex-1">
        {isError ? '本地音乐暂时不可用，请检查权限。'
          : source.platform === 'android' && denied ? '允许读取手机音乐后，即可离线播放。'
          : '本地曲库还是空的，先添加设备上的音乐。'}
      </p>
      <Button asChild variant="outline" className="h-11 shrink-0">
        <Link to="/library"><FolderOpen className="mr-2 h-4 w-4" />{source.platform === 'android' && denied ? '允许读取音乐' : '添加本地音乐'}</Link>
      </Button>
    </div>
  )
}
