import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTracksToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylist,
} from '@/api/client'
import type { PlaylistCreate, PlaylistUpdate } from '@/types/api'
import { useLibrarySource } from '@/platform/useLibrarySource'

export function usePlaylists() {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['playlists', source.id],
    queryFn: () => getPlaylists(source.id),
  })
}

export function usePlaylist(id: number) {
  const source = useLibrarySource()
  return useQuery({
    queryKey: ['playlist', source.id, id],
    queryFn: () => getPlaylist(id, source.id),
    enabled: id > 0,
  })
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: (payload: PlaylistCreate) => createPlaylist(payload, source.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useUpdatePlaylist() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PlaylistUpdate }) =>
      updatePlaylist(id, payload, source.id),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      queryClient.invalidateQueries({ queryKey: ['playlist', source.id, id] })
    },
  })
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: (id: number) => deletePlaylist(id, source.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useAddTracksToPlaylist() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ id, trackIds, sourceId = source.id }: { id: number; trackIds: number[]; sourceId?: string }) =>
      addTracksToPlaylist(id, trackIds, sourceId),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      queryClient.invalidateQueries({ queryKey: ['playlist', source.id, id] })
    },
  })
}

export function useRemoveTrackFromPlaylist() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ playlistId, trackId }: { playlistId: number; trackId: number }) =>
      removeTrackFromPlaylist(playlistId, trackId, source.id),
    onSuccess: (_data, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      queryClient.invalidateQueries({ queryKey: ['playlist', source.id, playlistId] })
    },
  })
}

export function useReorderPlaylist() {
  const queryClient = useQueryClient()
  const source = useLibrarySource()
  return useMutation({
    mutationFn: ({ id, trackIds }: { id: number; trackIds: number[] }) =>
      reorderPlaylist(id, trackIds, source.id),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['playlist', source.id, id] })
    },
  })
}
