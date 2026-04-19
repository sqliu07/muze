import { useFavorites } from '@/api/hooks/useFavorites'
import TrackList from '@/components/library/TrackList'

export default function FavoritesPage() {
  const { data, isLoading } = useFavorites()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">收藏</h1>

      {isLoading && <p className="text-muted-foreground">加载中...</p>}

      {!isLoading && data && data.length === 0 && (
        <p className="text-muted-foreground">暂无收藏歌曲。</p>
      )}

      {!isLoading && data && data.length > 0 && (
        <TrackList tracks={data} />
      )}
    </div>
  )
}
