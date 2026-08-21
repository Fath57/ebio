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
import { AppNavigation } from './src/app/navigation'
import { CartProvider } from './src/features/cart/cart-context'
import { AnimatedSplash } from './src/features/common/components/animated-splash'
import { AppAlertHost } from './src/features/common/components/app-alert'
import { LocationProvider } from './src/features/common/location-context'
import { useNotifications } from './src/features/notifications/hooks/use-notifications'
import { OnboardingScreen } from './src/features/onboarding/components/onboarding-screen'
import { colors } from './src/theme/theme'
import { ThemeProvider } from './src/theme/theme-context'
import { hydrateStorageCache, storage } from './src/utils/offline-storage'

SplashScreen.preventAutoHideAsync()

const ONBOARDING_KEY = 'onboarding_seen'

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
  useNotifications()
  const [fontsLoaded] = useFonts({
    DMSerifDisplay_400Regular,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    JetBrainsMono_500Medium,
  })

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) {
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
