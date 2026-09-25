import type { ConfigContext, ExpoConfig } from 'expo/config'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Build-time variant selection: one codebase, three Play Store apps.
// APP_VARIANT drives the native identity; EXPO_PUBLIC_APP_VARIANT (set alongside
// it in eas.json / npm scripts) drives the JS entry via inlined env.
type AppVariant = 'client' | 'supplier' | 'courier'

const GOOGLE_MAPS_API_KEY = 'AIzaSyCORM4EfahnboCw0KbkZsazcAzuFnV30pY'

interface VariantConfig {
  name: string
  androidPackage: string
  scheme: string
  googleServicesFile: string
  icon: string
  adaptiveIcon: string
  splash: string
}

const VARIANTS: Record<AppVariant, VariantConfig> = {
  client: {
    name: 'eBio',
    androidPackage: 'com.ebio.mobile',
    scheme: 'ebio-mobile',
    googleServicesFile: './google-services.json',
    icon: './assets/icon.png',
    adaptiveIcon: './assets/adaptive-icon.png',
    splash: './assets/splash-icon.png',
  },
  supplier: {
    name: 'eBio Fournisseur',
    androidPackage: 'com.ebio.supplier',
    scheme: 'ebio-supplier',
    googleServicesFile: './google-services.supplier.json',
    icon: './assets/icon-supplier.png',
    adaptiveIcon: './assets/adaptive-icon-supplier.png',
    splash: './assets/splash-icon-supplier.png',
  },
  courier: {
    name: 'eBio Livreur',
    androidPackage: 'com.ebio.courier',
    scheme: 'ebio-courier',
    googleServicesFile: './google-services.courier.json',
    icon: './assets/icon-courier.png',
    adaptiveIcon: './assets/adaptive-icon-courier.png',
    splash: './assets/splash-icon-courier.png',
  },
}

function resolveVariant(): AppVariant {
  const raw = process.env.APP_VARIANT ?? process.env.EXPO_PUBLIC_APP_VARIANT ?? 'client'
  if (raw === 'supplier' || raw === 'courier') {
    return raw
  }
  return 'client'
}

// Variant-specific assets land with T047 (Firebase) and design; until then we
// fall back to the client files so dev builds of every variant keep working.
function withFallback(path: string, fallback: string): string {
  return existsSync(join(__dirname, path)) ? path : fallback
}

// The client file only fits com.ebio.mobile: reusing it for another package
// makes the google-services gradle plugin fail with a package-name mismatch.
// Until the Firebase apps exist (T047), supplier/courier build without FCM.
function googleServicesFor(variant: AppVariant): string | undefined {
  const path = VARIANTS[variant].googleServicesFile
  if (existsSync(join(__dirname, path))) {
    return path
  }
  return variant === 'client' ? './google-services.json' : undefined
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = resolveVariant()
  const v = VARIANTS[variant]

  return {
    ...config,
    name: v.name,
    slug: 'ebio-mobile',
    // Pinned, not inferred. Expo defaults this list from what it finds
    // installed, and the result differed between this machine and the EAS
    // worker ('web' on one side only) — which moved the fingerprint and made
    // the build refuse its own runtime version. There is no web target.
    platforms: ['android', 'ios'],
    version: '1.5.0',
    scheme: v.scheme,
    orientation: 'portrait',
    icon: withFallback(v.icon, './assets/icon.png'),
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    // Over-the-air updates. The channel is set per build profile in eas.json,
    // one per variant: an update is addressed by channel + runtimeVersion +
    // platform, never by Android package, and the three apps share this one
    // project — a common channel would drop the client bundle onto the
    // courier app.
    updates: {
      url: 'https://u.expo.dev/34d0f388-ffd9-48e9-aeb3-12460fa50a44',
      fallbackToCacheTimeout: 0,
    },
    // The fingerprint is computed from the native dependencies, so it moves on
    // its own the day a native module is added — and an update built against
    // that module is then never served to a binary that lacks it. `appVersion`
    // would have happily shipped JS calling expo-image-manipulator to a build
    // that does not contain it.
    runtimeVersion: {
      policy: 'fingerprint',
    },
    splash: {
      image: withFallback(v.splash, './assets/splash-icon.png'),
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: v.androidPackage,
      googleServicesFile: './GoogleService-Info.plist',
      config: {
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: withFallback(v.adaptiveIcon, './assets/adaptive-icon.png'),
        backgroundColor: '#ffffff',
      },
      package: v.androidPackage,
      versionCode: 1,
      googleServicesFile: googleServicesFor(variant),
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_API_KEY,
        },
      },
      permissions: [
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        // Android 13+: without the manifest entry the runtime prompt is a
        // silent no-op and no push permission can ever be granted.
        'android.permission.POST_NOTIFICATIONS',
      ],
      // expo-audio merges FOREGROUND_SERVICE_MEDIA_PLAYBACK from its own
      // manifest, which forces a Play Console declaration. The app only plays
      // chat voice notes in the foreground and never enables lock-screen
      // controls, so the media playback service is never started.
      blockedPermissions: [
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      ],
      // Universal links stay on the client app only: the published app keeps
      // handling https://e-bio.org/boutique links after the split.
      intentFilters: variant === 'client'
        ? [
            {
              action: 'VIEW',
              autoVerify: true,
              // One entry per shared path. App Links are verified per host,
              // but Android only hands over a URL whose path is declared —
              // an undeclared /produit link silently opened the browser.
              data: [
                {
                  scheme: 'https',
                  host: 'e-bio.org',
                  pathPrefix: '/boutique',
                },
                {
                  scheme: 'https',
                  host: 'e-bio.org',
                  pathPrefix: '/produit',
                },
              ],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ]
        : [],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      [
        'expo-location',
        {
          locationWhenInUsePermission: variant === 'courier'
            ? 'eBio Livreur utilise votre position pour vous proposer les courses proches de vous.'
            : 'eBio utilise votre position pour afficher les produits et fournisseurs bio près de vous.',
        },
      ],
      'expo-local-authentication',
      [
        'expo-audio',
        {
          microphonePermission: 'eBio utilise le micro pour enregistrer vos notes vocales dans la messagerie.',
        },
      ],
      'expo-notifications',
      'expo-secure-store',
      'expo-font',
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: 'com.googleusercontent.apps.REPLACE_WITH_REVERSED_IOS_CLIENT_ID',
        },
      ],
    ],
    extra: {
      appVariant: variant,
      eas: {
        projectId: '34d0f388-ffd9-48e9-aeb3-12460fa50a44',
      },
    },
    owner: 'fath_57',
  }
}
