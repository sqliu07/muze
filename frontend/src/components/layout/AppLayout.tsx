import { useCallback, useEffect, useState } from "react"
import { Link, Outlet, useLocation } from "react-router-dom"
import { ArrowLeft, Settings } from "lucide-react"
import { useAudio } from "@/hooks/useAudio"
import { Sidebar } from "./Sidebar"
import { MobileTabBar } from "./MobileTabBar"
import { BottomBar } from "@/components/player/BottomBar"
import NowPlayingPage from "@/components/nowplaying/NowPlayingPage"
import { GlobalSearchInput } from "@/components/search/GlobalSearchInput"
import { SearchResults } from "@/components/search/SearchResults"
import { LibrarySourceSelector } from "@/components/library/LibrarySourceSelector"
import { useMobileNavigation } from "@/platform/navigation/useMobileNavigation"

export function AppLayout() {
  const { seek } = useAudio()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResetRevision, setSearchResetRevision] = useState(0)
  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResetRevision((revision) => revision + 1)
  }, [])
  const { back, showBack } = useMobileNavigation(Boolean(searchQuery), clearSearch)

  useEffect(() => {
    setSearchQuery('')
  }, [location])

  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 桌面侧边栏 */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* 主内容区 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* 顶部搜索栏 */}
          <header className="app-header flex shrink-0 flex-wrap items-center justify-end gap-2 border-b px-3 py-2 md:flex-nowrap md:px-4">
            <div className="w-full md:mr-auto md:w-72"><LibrarySourceSelector compact /></div>
            {(showBack || searchQuery) && <button onClick={back} aria-label="返回上一页" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"><ArrowLeft className="h-5 w-5" /></button>}
            <div className="min-w-0 flex-1 md:w-64 md:flex-none">
              <GlobalSearchInput key={`${location.key}:${searchResetRevision}`} onSearch={setSearchQuery} />
            </div>
            <Link to="/settings" aria-label="设置" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden">
              <Settings className="h-5 w-5" />
            </Link>
          </header>

          {/* 页面内容 */}
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {searchQuery ? (
              <SearchResults query={searchQuery} />
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>

      {/* 底部播放栏 */}
      <BottomBar onSeek={seek} />

      {/* 移动端标签栏 */}
      <MobileTabBar />

      {/* 全屏播放页 */}
      <NowPlayingPage />
    </div>
  )
}
