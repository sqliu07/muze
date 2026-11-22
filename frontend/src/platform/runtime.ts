export type RuntimePlatform = 'web' | 'windows' | 'android'

export function getRuntimePlatform(): RuntimePlatform {
  if (typeof window === 'undefined') return 'web'
  const runtime = window as Window & {
    __TAURI_INTERNALS__?: unknown
    androidBridge?: unknown
    Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean }
  }
  if (runtime.__TAURI_INTERNALS__) return 'windows'
  // Android injects its bridge before the Capacitor JS module initializes.
  if (runtime.androidBridge) return 'android'
  if (runtime.Capacitor?.getPlatform?.() === 'android' && runtime.Capacitor.isNativePlatform?.()) {
    return 'android'
  }
  return 'web'
}
