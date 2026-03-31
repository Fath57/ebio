import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'app-theme'

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'system'
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)

  // Also listen to system theme changes for 'system' mode
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleMediaChange = () => emitChange()
  mediaQuery.addEventListener('change', handleMediaChange)

  // Listen to storage events (cross-tab)
  const handleStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) emitChange()
  }
  window.addEventListener('storage', handleStorage)

  return () => {
    listeners.delete(callback)
    mediaQuery.removeEventListener('change', handleMediaChange)
    window.removeEventListener('storage', handleStorage)
  }
}

function getSnapshot(): Theme {
  return getStoredTheme()
}

function getServerSnapshot(): Theme {
  return 'system'
}

export default function useTheme(): [Theme, ResolvedTheme, (newTheme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const resolved = resolveTheme(theme)

  const setTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    emitChange()
  }, [])

  return [theme, resolved, setTheme]
}
