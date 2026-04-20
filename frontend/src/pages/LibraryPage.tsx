import { useState } from 'react'
import { useTracks } from '@/api/hooks/useTracks'
import TrackList from '@/components/library/TrackList'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

export default function LibraryPage() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useTracks({ search, sort: 'title', limit: 200 })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">全部歌曲</h1>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜索歌曲..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">加载中...</p>}

      {!isLoading && data && data.items.length === 0 && (
        <p className="text-muted-foreground">暂无歌曲，请在媒体库页面导入音乐文件夹。</p>
      )}

      {!isLoading && data && data.items.length > 0 && (
        <TrackList tracks={data.items} />
      )}
    </div>
  )
}
