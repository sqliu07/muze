import type { PersistStorage, StorageValue } from 'zustand/middleware'

/** Queue/settings changes save immediately; frequent clock snapshots save at most once a second. */
export function createPlaybackStorage<T>(): PersistStorage<T> {
  let previous: StorageValue<T> | undefined
  let pending: { name: string; value: StorageValue<T> } | undefined
  let lastWrite = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const storage = () => typeof window === 'undefined' ? undefined : window.localStorage
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (!pending) return
    try { storage()?.setItem(pending.name, JSON.stringify(pending.value)) } catch { /* Playback remains usable if storage is full. */ }
    lastWrite = Date.now()
    pending = undefined
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', flush)
  }
  return {
    getItem(name) {
      try { const raw = storage()?.getItem(name); return raw ? JSON.parse(raw) : null } catch { return null }
    },
    setItem(name, value) {
      const oldState = previous?.state as Record<string, unknown> | undefined
      const nextState = value.state as Record<string, unknown>
      const meaningfulChange = !oldState || Object.keys(nextState).some((key) => key !== 'currentTime' && oldState[key] !== nextState[key])
      previous = value
      pending = { name, value }
      if (meaningfulChange || Date.now() - lastWrite >= 1000) flush()
      else if (!timer) {
        timer = setTimeout(flush, 1000 - (Date.now() - lastWrite))
        if (typeof timer === 'object' && 'unref' in timer) timer.unref()
      }
    },
    removeItem(name) { pending = undefined; if (timer) clearTimeout(timer); timer = undefined; storage()?.removeItem(name) },
  }
}
