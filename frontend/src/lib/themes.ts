export type ThemeName = 'light' | 'dark' | 'sepia' | 'nord' | 'rose-pine'

export interface ThemeOption {
  value: ThemeName
  label: string
}

export const THEMES: ThemeOption[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'sepia', label: '护眼' },
  { value: 'nord', label: 'Nord' },
  { value: 'rose-pine', label: 'Rosé Pine' },
]

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme)
}
