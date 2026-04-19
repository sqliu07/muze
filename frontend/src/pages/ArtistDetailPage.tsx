import { useParams } from 'react-router-dom'
import { useArtist } from '@/api/hooks/useArtists'
import { getArtistCoverUrl } from '@/api/client'
import AlbumGrid from '@/components/library/AlbumGrid'

export default function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: artist, isLoading } = useArtist(Number(id))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        加载中...
      </div>
    )
  }

  if (!artist) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        歌手不存在
      </div>
    )
  }

  const albums = artist.albums ?? []

  return (
    <div>
      {/* 顶部渐变区域 */}
      <div className="relative bg-gradient-to-b from-muted to-transparent p-6">
        <div className="flex gap-6 items-end">
          {/* 圆形头像 */}
          <div className="shrink-0 w-32 h-32 rounded-full overflow-hidden bg-muted flex items-center justify-center text-5xl">
            {artist.cover_path ? (
              <img
                src={getArtistCoverUrl(artist.id)}
                alt={artist.name}
                className="h-full w-full object-cover"
              />
            ) : (
              '🎤'
            )}
          </div>

          {/* 信息 */}
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">歌手</p>
            <h1 className="text-3xl font-bold truncate">{artist.name}</h1>
            <p className="text-sm text-muted-foreground">
              {albums.length} 张专辑
            </p>
          </div>
        </div>
      </div>

      {/* 专辑列表 */}
      {albums.length > 0 && (
        <div className="pb-8">
          <AlbumGrid albums={albums} />
        </div>
      )}
    </div>
  )
}
