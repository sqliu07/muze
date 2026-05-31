import { useParams } from 'react-router-dom'
import { Play } from 'lucide-react'
import { useAlbum } from '@/api/hooks/useAlbums'
import { getAlbumCoverUrl } from '@/api/client'
import { usePlayerStore } from '@/store/playerStore'
import TrackList from '@/components/library/TrackList'

export default function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: album, isLoading } = useAlbum(Number(id))
  const setQueue = usePlayerStore((s) => s.setQueue)

  const handlePlayAll = () => {
    if (album?.tracks && album.tracks.length > 0) {
      setQueue(album.tracks, 0)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        加载中...
      </div>
    )
  }

  if (!album) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        专辑不存在
      </div>
    )
  }

  return (
    <div>
      {/* 顶部渐变区域 */}
      <div className="relative bg-gradient-to-b from-muted to-transparent p-6">
        <div className="flex gap-6 items-end">
          {/* 封面 */}
          <div className="shrink-0 w-40 h-40 rounded-xl shadow-lg overflow-hidden bg-muted">
            {album.cover_path ? (
              <img
                src={getAlbumCoverUrl(album.id)}
                alt={album.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl text-muted-foreground">
                ♪
              </div>
            )}
          </div>

          {/* 信息 */}
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">专辑</p>
            <h1 className="text-3xl font-bold truncate">{album.title}</h1>
            <p className="text-sm text-muted-foreground">
              {album.artist?.name ?? '未知歌手'}
              {album.year ? ` · ${album.year}` : ''}
            </p>
            <p className="text-sm text-muted-foreground">
              {album.total_tracks} 首曲目
            </p>
          </div>
        </div>
      </div>

      {/* 播放全部 */}
      <div className="flex items-center px-6 py-4">
        <button
          onClick={handlePlayAll}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Play className="h-4 w-4" fill="currentColor" />
          播放
        </button>
      </div>

      {/* 曲目列表 */}
      <div className="px-4 pb-8">
        <TrackList tracks={album.tracks ?? []} />
      </div>
    </div>
  )
}
