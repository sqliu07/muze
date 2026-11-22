import { useTracks } from '@/api/hooks/useTracks'
import TrackList from '@/components/library/TrackList'
import { LocalLibraryNotice } from '@/components/library/LocalLibraryNotice'
import { useState, useEffect } from 'react'
import { useLibrarySource } from '@/platform/useLibrarySource'
import { Button } from '@/components/ui/button'

export default function LibraryPage() {
  const source = useLibrarySource()
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [source.id])
  const { data, isLoading } = useTracks({ sort: 'title', limit: 200, page })

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">全部歌曲</h1>
      <LocalLibraryNotice />

      {isLoading && <p className="text-muted-foreground">加载中...</p>}

      {!isLoading && data && data.items.length === 0 && (
        <p className="text-muted-foreground">暂无歌曲，请在媒体库页面导入音乐文件夹。</p>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <TrackList tracks={data.items} />
      )}
      {data && data.total > 200 && (
        <nav aria-label="歌曲分页" className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" className="h-11" disabled={page <= 1 || isLoading} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">{page} / {Math.ceil(data.total / 200)} · {data.total} 首</span>
          <Button variant="outline" className="h-11" disabled={page * 200 >= data.total || isLoading} onClick={() => setPage(page + 1)}>下一页</Button>
        </nav>
      )}
    </div>
  )
}
