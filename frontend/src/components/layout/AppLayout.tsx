import { useEffect, useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { useAudio } from "@/hooks/useAudio"
import { Sidebar } from "./Sidebar"
import { MobileTabBar } from "./MobileTabBar"
import { BottomBar } from "@/components/player/BottomBar"
import NowPlayingPage from "@/components/nowplaying/NowPlayingPage"
import { GlobalSearchInput } from "@/components/search/GlobalSearchInput"
import { SearchResults } from "@/components/search/SearchResults"

export function AppLayout() {
  const { seek } = useAudio()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setSearchQuery('')
  }, [location])

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* 桌面侧边栏 */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* 主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 顶部搜索栏 */}
          <header className="flex items-center justify-end border-b px-4 py-2">
            <div className="w-64">
              <GlobalSearchInput onSearch={setSearchQuery} />
            </div>
          </header>

          {/* 页面内容 */}
          <main className="flex-1 overflow-y-auto">
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
