import { useAlbums } from '@/api/hooks/useAlbums'
import AlbumGrid from '@/components/library/AlbumGrid'

export default function AlbumsPage() {
  const { data: albums, isLoading } = useAlbums()

  return (
    <div>
      <div className="px-4 pt-4">
        <h1 className="text-2xl font-bold">
          专辑{albums ? ` · ${albums.length} 张专辑` : ''}
        </h1>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          加载中...
        </div>
      ) : albums && albums.length > 0 ? (
        <AlbumGrid albums={albums} />
      ) : (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          暂无专辑
        </div>
      )}
    </div>
  )
}
