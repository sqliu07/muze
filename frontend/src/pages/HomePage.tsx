import { useNavigate } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { useAlbums } from "@/api/hooks/useAlbums"
import { usePlaylists } from "@/api/hooks/usePlaylists"
import { useTracks } from "@/api/hooks/useTracks"
import AlbumGrid from "@/components/library/AlbumGrid"
import TrackList from "@/components/library/TrackList"

export default function HomePage() {
  const navigate = useNavigate()
  const { data: albums } = useAlbums()
  const { data: playlists } = usePlaylists()
  const { data: recentTracks } = useTracks({ sort: "date_added", order: "desc", limit: 10 })

  const recentAlbums = albums ? albums.slice(0, 6) : []
  const recentPlaylists = playlists ? playlists.slice(0, 6) : []

  return (
    <div className="p-6 space-y-8">
      {/* 专辑 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">专辑</h2>
          {albums && albums.length > 6 && (
            <button
              onClick={() => navigate("/albums")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              全部 <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {recentAlbums.length > 0 ? (
          <AlbumGrid albums={recentAlbums} />
        ) : (
          <p className="text-sm text-muted-foreground px-4">暂无专辑</p>
        )}
      </section>

      {/* 播放列表 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">播放列表</h2>
          {playlists && playlists.length > 6 && (
            <button
              onClick={() => navigate("/playlists")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              全部 <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
        {recentPlaylists.length > 0 ? (
          <div className="space-y-1">
            {recentPlaylists.map((pl) => (
              <div
                key={pl.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer"
                onClick={() => navigate(`/playlists/${pl.id}`)}
              >
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-lg shrink-0">
                  ♬
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{pl.name}</p>
                  <p className="text-sm text-muted-foreground">{pl.track_count} 首曲目</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground px-4">暂无播放列表</p>
        )}
      </section>

      {/* 最近添加 */}
      {recentTracks && recentTracks.items.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">最近添加</h2>
          <TrackList tracks={recentTracks.items} />
        </section>
      )}
    </div>
  )
}
