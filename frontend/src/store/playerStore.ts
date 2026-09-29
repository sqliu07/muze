import { create } from "zustand"
import { persist } from "zustand/middleware"
import { type TrackOut } from "@/types/api"
import { PREV_RESTART_THRESHOLD } from "@/config/player"
import { seekAudio } from "@/hooks/useAudio"

export type Track = TrackOut

export type PlayMode = "sequential" | "repeat-all" | "repeat-one" | "shuffle"
import {
  createEqualizerState,
  clampGain,
  normalizeEqualizerState,
  type EqualizerPresetName,
  type EqualizerState,
} from "@/lib/equalizer"
export { DEFAULT_EQUALIZER_BANDS, EQUALIZER_PRESETS, EQUALIZER_PRESET_PREAMPS } from "@/lib/equalizer"
export type { EqualizerBand, EqualizerPreset, EqualizerPresetName, EqualizerState } from "@/lib/equalizer"
interface PlayerState {
  queue: Track[]
  currentIndex: number
  isPlaying: boolean
  volume: number
  playMode: PlayMode
  currentTime: number
  equalizer: EqualizerState

  setQueue: (tracks: Track[], startIndex?: number) => void
  playTrack: (track: Track) => void
  addToQueue: (track: Track) => void
  removeFromQueue: (index: number) => void
  playNext: () => void
  playPrev: () => void
  setPlaying: (playing: boolean) => void
  setVolume: (volume: number) => void
  setPlayMode: (mode: PlayMode) => void
  setCurrentTime: (time: number) => void
  setEqualizerEnabled: (enabled: boolean) => void
  setEqualizerPreamp: (gain: number) => void
  setEqualizerBandGain: (frequency: number, gain: number) => void
  setEqualizerPreset: (preset: EqualizerPresetName) => void
  resetEqualizer: () => void
  replaceQueuedTrack: (track: Track) => void
  cyclePlayMode: () => void
  toggleCurrentTrackFavorite: () => void
}

const playModeOrder: PlayMode[] = [
  "sequential",
  "repeat-all",
  "repeat-one",
  "shuffle",
]

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      currentIndex: -1,
      isPlaying: false,
      volume: 0.8,
      playMode: "sequential",
      currentTime: 0,
      equalizer: createEqualizerState(),

      setQueue: (tracks, startIndex = 0) =>
        set({
          queue: tracks,
          currentIndex: tracks.length > 0 ? startIndex : -1,
          isPlaying: tracks.length > 0,
          currentTime: 0,
        }),

      playTrack: (track) => {
        const { queue } = get()
        const existingIndex = queue.findIndex((t) => t.id === track.id)
        if (existingIndex !== -1) {
          set({ currentIndex: existingIndex, isPlaying: true, currentTime: 0 })
        } else {
          set({
            queue: [track, ...queue],
            currentIndex: 0,
            isPlaying: true,
            currentTime: 0,
          })
        }
      },

      addToQueue: (track) =>
        set((state) => ({ queue: [...state.queue, track] })),

      removeFromQueue: (index) =>
        set((state) => {
          if (index < 0 || index >= state.queue.length) return state
          const newQueue = state.queue.filter((_, i) => i !== index)
          let newCurrentIndex = state.currentIndex
          if (index < state.currentIndex) {
            newCurrentIndex = state.currentIndex - 1
          } else if (index === state.currentIndex) {
            if (newQueue.length === 0) {
              newCurrentIndex = -1
            } else if (newCurrentIndex >= newQueue.length) {
              newCurrentIndex = newQueue.length - 1
            }
          }
          return {
            queue: newQueue,
            currentIndex: newCurrentIndex,
            isPlaying:
              newCurrentIndex === -1 ? false : state.isPlaying,
          }
        }),

      playNext: () => {
        const { queue, currentIndex, playMode } = get()
        if (queue.length === 0 || currentIndex < 0) return

        let nextIndex: number
        switch (playMode) {
          case "shuffle":
            nextIndex = Math.floor(Math.random() * queue.length)
            break
          case "repeat-one":
            nextIndex = currentIndex
            break
          case "repeat-all":
            nextIndex = (currentIndex + 1) % queue.length
            break
          case "sequential":
          default:
            if (currentIndex >= queue.length - 1) {
              set({ isPlaying: false })
              return
            }
            nextIndex = currentIndex + 1
            break
        }
        set({ currentIndex: nextIndex, currentTime: 0 })
      },

      playPrev: () => {
        const { queue, currentIndex, currentTime } = get()
        if (queue.length === 0 || currentIndex < 0) return

        // 播放超过 3 秒，回到当前曲目开头
        if (currentTime > PREV_RESTART_THRESHOLD) {
          seekAudio(0)
          return
        }

        const prevIndex =
          currentIndex <= 0 ? queue.length - 1 : currentIndex - 1
        set({ currentIndex: prevIndex, currentTime: 0 })
      },

      setPlaying: (playing) => set({ isPlaying: playing }),
      setVolume: (volume) => set({ volume }),
      setPlayMode: (mode) => set({ playMode: mode }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setEqualizerEnabled: (enabled) =>
        set((state) => ({
          equalizer: { ...state.equalizer, enabled },
        })),
      setEqualizerPreamp: (gain) =>
        set((state) => ({
          equalizer: {
            ...state.equalizer,
            preset: "custom",
            preamp: clampGain(gain),
          },
        })),
      setEqualizerBandGain: (frequency, gain) =>
        set((state) => ({
          equalizer: {
            ...state.equalizer,
            preset: "custom",
            bands: state.equalizer.bands.map((band) =>
              band.frequency === frequency
                ? { ...band, gain: clampGain(gain) }
                : band
            ),
          },
        })),
      setEqualizerPreset: (preset) =>
        set((state) => ({
          equalizer: {
            ...createEqualizerState(preset, state.equalizer.enabled),
          },
        })),
      resetEqualizer: () =>
        set((state) => ({
          equalizer: createEqualizerState("flat", state.equalizer.enabled),
        })),
      replaceQueuedTrack: (track) =>
        set((state) => ({
          queue: state.queue.map((queued) =>
            queued.id === track.id ? track : queued
          ),
        })),

      cyclePlayMode: () =>
        set((state) => {
          const idx = playModeOrder.indexOf(state.playMode)
          const next = playModeOrder[(idx + 1) % playModeOrder.length]
          return { playMode: next }
        }),

      toggleCurrentTrackFavorite: () =>
        set((state) => {
          const { queue, currentIndex } = state
          if (currentIndex < 0 || currentIndex >= queue.length) return state
          const track = queue[currentIndex]
          const newQueue = [...queue]
          newQueue[currentIndex] = { ...track, is_favorite: !track.is_favorite }
          return { queue: newQueue }
        }),
    }),
    {
      name: "muze-player",
      partialize: (state) => ({
        volume: state.volume,
        playMode: state.playMode,
        equalizer: state.equalizer,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<PlayerState> | undefined
        return {
          ...current,
          ...persistedState,
          equalizer: normalizeEqualizerState(persistedState?.equalizer),
        }
      },
    }
  )
)

export const currentTrackSelector = (state: PlayerState): Track | undefined =>
  state.currentIndex >= 0 && state.currentIndex < state.queue.length
    ? state.queue[state.currentIndex]
    : undefined
