import { Outlet } from "react-router-dom"
import { useAudio } from "@/hooks/useAudio"
import { Sidebar } from "./Sidebar"
import { MobileTabBar } from "./MobileTabBar"
import { BottomBar } from "@/components/player/BottomBar"
import NowPlayingPage from "@/components/nowplaying/NowPlayingPage"

export function AppLayout() {
  const { seek } = useAudio()

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* 桌面侧边栏 */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
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
