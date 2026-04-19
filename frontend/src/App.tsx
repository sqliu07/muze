import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AppLayout } from "@/components/layout/AppLayout"
import HomePage from "@/pages/HomePage"
import LibraryPage from "@/pages/LibraryPage"
import AlbumsPage from "@/pages/AlbumsPage"
import AlbumDetailPage from "@/pages/AlbumDetailPage"
import ArtistsPage from "@/pages/ArtistsPage"
import ArtistDetailPage from "@/pages/ArtistDetailPage"
import PlaylistsPage from "@/pages/PlaylistsPage"
import PlaylistDetailPage from "@/pages/PlaylistDetailPage"
import FavoritesPage from "@/pages/FavoritesPage"
import LibraryManagePage from "@/pages/LibraryManagePage"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/tracks" element={<LibraryPage />} />
          <Route path="/albums" element={<AlbumsPage />} />
          <Route path="/albums/:id" element={<AlbumDetailPage />} />
          <Route path="/artists" element={<ArtistsPage />} />
          <Route path="/artists/:id" element={<ArtistDetailPage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/library" element={<LibraryManagePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
