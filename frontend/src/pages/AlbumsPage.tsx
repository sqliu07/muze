import { useState } from 'react'
import { useAlbums } from '@/api/hooks/useAlbums'
import AlbumGrid from '@/components/library/AlbumGrid'
import SortSelector from '@/components/library/SortSelector'

const SORT_FIELDS = [
  { value: 'title', label: '名称' },
  { value: 'artist', label: '艺术家' },
  { value: 'year', label: '年份' },
  { value: 'total_tracks', label: '曲目数' },
]

export default function AlbumsPage() {
  const [sortField, setSortField] = useState('title')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const { data: albums, isLoading } = useAlbums({ sort: sortField, order: sortOrder })

  return (
    <div>
      <div className="px-4 pt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          专辑{albums ? ` · ${albums.length} 张专辑` : ''}
        </h1>
        <SortSelector
          sortField={sortField}
          sortOrder={sortOrder}
          fieldOptions={SORT_FIELDS}
          onFieldChange={setSortField}
          onOrderChange={setSortOrder}
        />
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
