import { NavLink } from "react-router-dom"
import { Home, Music, Disc, Mic2, ListMusic, Heart, FolderOpen } from "lucide-react"
import { ThemeSwitcher } from "@/components/common/ThemeSwitcher"

const navItems = [
  { to: "/", icon: Home, label: "首页", end: true },
  { to: "/tracks", icon: Music, label: "全部歌曲", end: true },
  { to: "/albums", icon: Disc, label: "专辑" },
  { to: "/artists", icon: Mic2, label: "歌手" },
  { to: "/playlists", icon: ListMusic, label: "播放列表" },
  { to: "/favorites", icon: Heart, label: "收藏" },
  { to: "/library", icon: FolderOpen, label: "媒体库" },
]

export function Sidebar() {
  return (
    <aside
      className="flex h-full w-[220px] flex-col border-r"
      style={{ backgroundColor: "hsl(var(--sidebar-bg))" }}
    >
      {/* 顶部标题 + 主题切换 */}
      <div className="flex items-center justify-between px-4 py-4">
        <h1 className="text-lg font-bold">Muze</h1>
        <ThemeSwitcher />
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
