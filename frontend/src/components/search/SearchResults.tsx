import { useNavigate } from 'react-router-dom'
import { Mic2, Music } from 'lucide-react'
import { useSearch } from '@/api/hooks'
import { getArtistCoverUrl, getAlbumCoverUrl } from '@/api/client'
import { usePlayerStore } from '@/store/playerStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import AlbumGrid from '@/components/library/AlbumGrid'

interface SearchResultsProps {
  query: string
}

export function SearchResults({ query }: SearchResultsProps) {
  const navigate = useNavigate()
  const setQueue = usePlayerStore((s) => s.setQueue)
  const { data: results, isLoading } = useSearch(query, query.length > 0)

  if (!query) return null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        搜索中...
      </div>
    )
  }

  if (!results || (
    results.artists.length === 0 &&
    results.albums.length === 0 &&
    results.tracks.length === 0
  )) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        未找到结果
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-8 p-6">
        {/* 歌手结果 */}
        {results.artists.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">歌手</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {results.artists.map((artist) => (
                <button
                  key={`artist-${artist.id}`}
                  onClick={() => navigate(`/artists/${artist.id}`)}
                  className="group flex flex-col items-center gap-2 rounded-lg p-3 hover:bg-accent"
                >
                  {artist.cover_path ? (
                    <img
                      src={getArtistCoverUrl(artist.id)}
                      alt={artist.name}
                      className="h-24 w-24 rounded-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
                      <Mic2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-center text-sm font-medium truncate w-full">
                    {artist.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 专辑结果 */}
        {results.albums.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">专辑</h2>
            <AlbumGrid albums={results.albums} />
          </section>
        )}

        {/* 曲目结果 */}
        {results.tracks.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold">曲目</h2>
            <div className="space-y-1">
              {results.tracks.map((track, idx) => (
                <button
                  key={`track-${track.id}`}
                  onClick={() => setQueue(results.tracks, idx)}
                  className="flex w-full items-center gap-4 rounded-md px-4 py-3 text-sm hover:bg-accent"
                >
                  {track.album?.cover_path ? (
                    <img
                      src={getAlbumCoverUrl(track.album_id!)}
                      alt={track.album.title}
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                      <Music className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex flex-col items-start flex-1 min-w-0">
                    <span className="font-medium truncate w-full text-left">{track.title}</span>
                    <span className="text-xs text-muted-foreground truncate w-full text-left">
                      {track.artist?.name ?? '未知歌手'}
                      {track.album?.title ? ` · ${track.album.title}` : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </ScrollArea>
  )
}
