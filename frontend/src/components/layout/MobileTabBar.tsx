import { NavLink } from "react-router-dom"
import { Music, Disc, ListMusic, Heart, FolderOpen } from "lucide-react"

const tabs = [
  { to: "/tracks", icon: Music, label: "歌曲" },
  { to: "/albums", icon: Disc, label: "专辑" },
  { to: "/playlists", icon: ListMusic, label: "歌单" },
  { to: "/favorites", icon: Heart, label: "收藏" },
  { to: "/library", icon: FolderOpen, label: "媒体库" },
]

export function MobileTabBar() {
  return (
    <nav aria-label="主导航" className="mobile-tab-bar z-40 flex shrink-0 border-t bg-background md:hidden">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          replace
          end={to === "/tracks"}
          className={({ isActive }) =>
            `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`
          }
        >
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
