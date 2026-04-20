import { useArtists } from '@/api/hooks/useArtists'
import ArtistGrid from '@/components/library/ArtistGrid'

export default function ArtistsPage() {
  const { data: artists, isLoading } = useArtists()

  return (
    <div>
      <div className="px-4 pt-4">
        <h1 className="text-2xl font-bold">
          歌手{artists ? ` · ${artists.length} 位歌手` : ''}
        </h1>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          加载中...
        </div>
      ) : artists && artists.length > 0 ? (
        <ArtistGrid artists={artists} />
      ) : (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          暂无歌手
        </div>
      )}
    </div>
  )
}
