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
    toggleFav.mutate({ trackId: track.id, isFavorite: track.is_favorite, sourceId: track.source_id })
  }

  return (
    <div
      className={cn(
        'group flex min-h-[68px] items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/50 md:gap-3 md:px-4',
        isActive && 'bg-primary/10',
      )}
      onDoubleClick={() => onPlay(track)}
    >
      {/* 序号 / Play 按钮 */}
      <div className="w-11 shrink-0 text-center md:w-8">
        <span className="hidden text-sm text-muted-foreground md:block md:group-hover:hidden">
          {index + 1}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="flex h-11 w-11 md:hidden md:h-8 md:w-8 md:group-hover:flex md:group-focus-within:flex"
          aria-label={`播放 ${track.title}`}
          onClick={() => onPlay(track)}
        >
          <Play className="h-4 w-4" />
        </Button>
      </div>

      {/* 封面缩略图 */}
      {track.album?.cover_path ? (
        <img
          src={track.source_id === "local:android" ? track.cover_url ?? undefined : getTrackCoverUrl(track.id, track.album?.cover_path, track.source_id)}
          alt={track.title}
          className="h-10 w-10 rounded object-cover shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-muted shrink-0" />
      )}

      {/* 曲名 + 歌手名 */}
      <div className="flex-[2] min-w-0">
        <p className={cn('truncate text-sm', isActive && 'text-primary font-medium')}>
          {track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {track.artist?.name ?? '未知歌手'}
        </p>
      </div>

      {/* 专辑名 */}
      <div className="flex-1 min-w-0 truncate text-sm text-muted-foreground hidden md:block">
        {track.album?.title ?? ''}
      </div>

      {/* 收藏按钮 */}
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 md:h-8 md:w-8" aria-label={track.is_favorite ? `取消收藏 ${track.title}` : `收藏 ${track.title}`} onClick={handleToggleFav}>
        <Heart
          className={cn('h-4 w-4', track.is_favorite && 'fill-current text-red-500')}
        />
      </Button>

      {/* 时长 */}
      <span className="hidden w-10 shrink-0 text-right text-sm text-muted-foreground sm:block">
        {formatDuration(track.duration)}
      </span>
    </div>
  )
}
