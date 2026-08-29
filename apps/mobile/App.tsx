// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck
import {
  DMSerifDisplay_400Regular,
} from '@expo-google-fonts/dm-serif-display'
import {
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppNavigation } from './src/app/navigation-entry'
import { CartProvider } from './src/features/cart/cart-context'
import { AnimatedSplash } from './src/features/common/components/animated-splash'
import { AppAlertHost } from './src/features/common/components/app-alert'
import { LocationProvider } from './src/features/common/location-context'
import { OnboardingScreen } from './src/features/onboarding/components/onboarding-screen'
import { colors } from './src/theme/theme'
import { ThemeProvider } from './src/theme/theme-context'
import { hydrateStorageCache, storage } from './src/utils/offline-storage'

SplashScreen.preventAutoHideAsync()

const ONBOARDING_KEY = 'onboarding_seen'
const FONT_LOAD_TIMEOUT_MS = 6000

export default function App(): React.JSX.Element | null {
  const [showSplash, setShowSplash] = useState(true)
  // null = still reading storage; resolved well before the splash ends.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)

  useEffect(() => {
    // Also hydrates the sync storage cache (registration drafts rely on it).
    hydrateStorageCache()
      .then(() => setShowOnboarding(storage.getString(ONBOARDING_KEY) !== '1'))
      .catch(() => setShowOnboarding(false))
  }, [])
  // Notifications are mounted once inside each variant's navigation root,
  // where the session is known — a second mount here double-fired every tap.
  const [fontsLoaded, fontError] = useFonts({
    DMSerifDisplay_400Regular,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    JetBrainsMono_500Medium,
  })

  // Never hold the whole app hostage to the font download: on an error or
  // after a few seconds, render with the system fonts and say why in the log.
  const [fontTimedOut, setFontTimedOut] = useState(false)
  useEffect(() => {
    if (fontsLoaded) {
      return
    }
    const timer = setTimeout(() => setFontTimedOut(true), FONT_LOAD_TIMEOUT_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [fontsLoaded])
  useEffect(() => {
    if (fontError) {
      console.warn('[fonts] loading failed, falling back to system fonts', fontError)
    }
    else if (fontTimedOut && !fontsLoaded) {
      console.warn('[fonts] still not loaded after timeout, rendering with system fonts')
    }
  }, [fontError, fontTimedOut, fontsLoaded])
  const fontsReady = fontsLoaded || fontError != null || fontTimedOut

  const onLayoutRootView = useCallback(async () => {
    if (fontsReady) {
      await SplashScreen.hideAsync()
    }
  }, [fontsReady])

  if (!fontsReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.neutral[0] }}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <ThemeProvider>
      <LocationProvider>
        <CartProvider>
          <SafeAreaProvider onLayout={onLayoutRootView}>
            <AppNavigation />
            <AppAlertHost />
            <StatusBar style="auto" />
            {showOnboarding === true && (
              <OnboardingScreen
                onFinish={() => {
                  storage.set(ONBOARDING_KEY, '1')
                  setShowOnboarding(false)
                }}
              />
            )}
            {showSplash && (
              <AnimatedSplash onFinish={() => setShowSplash(false)} />
            )}
          </SafeAreaProvider>
        </CartProvider>
      </LocationProvider>
    </ThemeProvider>
  )
}
