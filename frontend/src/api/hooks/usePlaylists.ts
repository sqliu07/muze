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

export function usePlaylists() {
  return useQuery({
    queryKey: ['playlists'],
    queryFn: getPlaylists,
  })
}

export function usePlaylist(id: number) {
  return useQuery({
    queryKey: ['playlist', id],
    queryFn: () => getPlaylist(id),
    enabled: id > 0,
  })
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PlaylistCreate) => createPlaylist(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useUpdatePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PlaylistUpdate }) =>
      updatePlaylist(id, payload),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      queryClient.invalidateQueries({ queryKey: ['playlist', id] })
    },
  })
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deletePlaylist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useAddTracksToPlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, trackIds }: { id: number; trackIds: number[] }) =>
      addTracksToPlaylist(id, trackIds),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      queryClient.invalidateQueries({ queryKey: ['playlist', id] })
    },
  })
}

export function useRemoveTrackFromPlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ playlistId, trackId }: { playlistId: number; trackId: number }) =>
      removeTrackFromPlaylist(playlistId, trackId),
    onSuccess: (_data, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] })
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] })
    },
  })
}

export function useReorderPlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, trackIds }: { id: number; trackIds: number[] }) =>
      reorderPlaylist(id, trackIds),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['playlist', id] })
    },
  })
}
