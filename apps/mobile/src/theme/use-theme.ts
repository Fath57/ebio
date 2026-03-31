import { useColorScheme } from 'react-native'
import { darkTheme, lightTheme } from './theme'

export function useTheme() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const theme = isDark ? darkTheme : lightTheme

  return { theme, isDark }
}
