import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { getAlbumCoverUrl } from '@/api/client'
import type { AlbumOut } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface AlbumCardProps {
  album: AlbumOut
  onSearchCover?: (album: AlbumOut) => void
}

export default function AlbumCard({ album, onSearchCover }: AlbumCardProps) {
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
        {onSearchCover && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={(event) => {
                  event.stopPropagation()
                  onSearchCover(album)
                }}
                className="absolute right-2 top-2 h-8 w-8 bg-background/85 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{album.cover_path ? '搜索封面' : '补封面'}</p>
            </TooltipContent>
          </Tooltip>
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
