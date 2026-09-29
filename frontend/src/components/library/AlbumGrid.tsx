import type { AlbumOut } from '@/types/api'
import AlbumCard from './AlbumCard'

interface AlbumGridProps {
  albums: AlbumOut[]
  onSearchCover?: (album: AlbumOut) => void
}

export default function AlbumGrid({ albums, onSearchCover }: AlbumGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-4">
      {albums.map((album) => (
        <AlbumCard key={album.id} album={album} onSearchCover={onSearchCover} />
      ))}
    </div>
  )
}
