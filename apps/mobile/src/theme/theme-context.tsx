import * as React from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Appearance } from 'react-native'
import { storage } from '../utils/offline-storage'
import { darkTheme, lightTheme } from './theme'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  mode: ThemeMode
  isDark: boolean
  setMode: (mode: ThemeMode) => void
  semantic: typeof lightTheme
}

const STORAGE_KEY = 'ebio_theme_mode'

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  isDark: false,
  setMode: () => {},
  semantic: lightTheme,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = storage.getString(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    return 'system'
  })

  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme())

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme)
    })
    return () => subscription.remove()
  }, [])

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    storage.set(STORAGE_KEY, newMode)
  }, [])

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark')
  const semantic = isDark ? darkTheme : lightTheme

  const value = useMemo(() => ({
    mode,
    isDark,
    setMode,
    semantic,
  }), [mode, isDark, setMode, semantic])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
