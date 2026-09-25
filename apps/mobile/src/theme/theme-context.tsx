import * as React from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { Appearance } from 'react-native'
import { storage } from '../utils/offline-storage'
import { darkTheme, lightTheme } from './theme'

type ThemeMode = 'light' | 'dark' | 'system'

/**
 * The semantic colour names, whatever theme is in force.
 *
 * Not `typeof lightTheme`: both themes are declared `as const`, so that froze
 * the light theme's own hex values into the type and the dark one could never
 * satisfy it. What a caller relies on is the set of names and that each gives
 * a colour — which is exactly what this says, while still refusing a name the
 * light theme does not define.
 */
export type SemanticColors = { [K in keyof typeof lightTheme]: string }

interface ThemeContextValue {
  mode: ThemeMode
  isDark: boolean
  setMode: (mode: ThemeMode) => void
  semantic: SemanticColors
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
    if (stored === 'light' || stored === 'dark' || stored === 'system')
      return stored
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
    <ThemeContext value={value}>
      {children}
    </ThemeContext>
  )
}

export function useTheme() {
  return use(ThemeContext)
}
