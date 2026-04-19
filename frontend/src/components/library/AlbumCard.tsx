import { useNavigate } from 'react-router-dom'
import { getAlbumCoverUrl } from '@/api/client'
import type { AlbumOut } from '@/types/api'

interface AlbumCardProps {
  album: AlbumOut
}

export default function AlbumCard({ album }: AlbumCardProps) {
  const navigate = useNavigate()

  return (
    <div
      className="group cursor-pointer space-y-2"
      onClick={() => navigate(`/albums/${album.id}`)}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {album.cover_path ? (
          <img
            src={getAlbumCoverUrl(album.id)}
            alt={album.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-muted-foreground">
            ♪
          </div>
        )}
      </div>
      <div>
        <p className="font-medium truncate">{album.title}</p>
        <p className="text-sm text-muted-foreground truncate">
          {album.artist?.name ?? '未知歌手'}
        </p>
      </div>
    </div>
  )
}
