import { useTracks } from '@/api/hooks/useTracks'
import TrackList from '@/components/library/TrackList'

export default function LibraryPage() {
  const { data, isLoading } = useTracks({ sort: 'title', limit: 200 })

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">全部歌曲</h1>

      {isLoading && <p className="text-muted-foreground">加载中...</p>}

      {!isLoading && data && data.items.length === 0 && (
        <p className="text-muted-foreground">暂无歌曲，请在媒体库页面导入音乐文件夹。</p>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <TrackList tracks={data.items} />
      )}
    </div>
  )
}
