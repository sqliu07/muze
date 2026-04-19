import { NavLink } from "react-router-dom"
import { Music, Disc, ListMusic, Heart } from "lucide-react"

const tabs = [
  { to: "/", icon: Music, label: "歌曲" },
  { to: "/albums", icon: Disc, label: "专辑" },
  { to: "/playlists", icon: ListMusic, label: "歌单" },
  { to: "/favorites", icon: Heart, label: "收藏" },
]

export function MobileTabBar() {
  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 flex border-t bg-background md:hidden">
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`
          }
        >
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </NavLink>
      ))}
    </div>
  )
}
