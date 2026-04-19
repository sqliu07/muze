import { type TrackOut } from '@/types/api'
import { getTrackCoverUrl } from '@/api/client'
import { useToggleFavorite } from '@/api/hooks/useFavorites'
import { formatDuration, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Play, Heart } from 'lucide-react'

interface TrackRowProps {
  track: TrackOut
  index: number
  isActive: boolean
  onPlay: (track: TrackOut) => void
}

export default function TrackRow({ track, index, isActive, onPlay }: TrackRowProps) {
  const toggleFav = useToggleFavorite()

  const handleToggleFav = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFav.mutate({ trackId: track.id, isFavorite: track.is_favorite })
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors',
        isActive && 'bg-primary/10',
      )}
      onDoubleClick={() => onPlay(track)}
    >
      {/* 序号 / Play 按钮 */}
      <div className="w-8 text-center shrink-0">
        <span className="text-sm text-muted-foreground group-hover:hidden">
          {index + 1}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="hidden group-hover:flex h-8 w-8"
          onClick={() => onPlay(track)}
        >
          <Play className="h-4 w-4" />
        </Button>
      </div>

      {/* 封面缩略图 */}
      {track.has_cover ? (
        <img
          src={getTrackCoverUrl(track.id)}
          alt={track.title}
          className="h-10 w-10 rounded object-cover shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-muted shrink-0" />
      )}

      {/* 曲名 + 歌手名 */}
      <div className="flex-1 min-w-0">
        <p className={cn('truncate text-sm', isActive && 'text-primary font-medium')}>
          {track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {track.artist?.name ?? '未知歌手'}
        </p>
      </div>

      {/* 专辑名 */}
      <div className="w-32 truncate text-sm text-muted-foreground hidden md:block">
        {track.album?.title ?? ''}
      </div>

      {/* 收藏按钮 */}
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleToggleFav}>
        <Heart
          className={cn('h-4 w-4', track.is_favorite && 'fill-current text-red-500')}
        />
      </Button>

      {/* 时长 */}
      <span className="text-sm text-muted-foreground w-10 text-right shrink-0">
        {formatDuration(track.duration)}
      </span>
    </div>
  )
}
