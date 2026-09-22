import type * as UpdatesModule from 'expo-updates'
import Download from 'lucide-react-native/dist/esm/icons/download'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

/**
 * `expo-updates` throws from its own import when the native module is absent,
 * which every build made before it was added is. Requiring it here keeps that
 * failure from killing the bundle on an older dev client.
 */
function loadUpdates(): typeof UpdatesModule | null {
  try {
    return require('expo-updates') as typeof UpdatesModule
  }
  catch {
    return null
  }
}

const Updates = loadUpdates()
const useUpdatesState = Updates?.useUpdates

/**
 * Shortest gap between two checks. Without it, every app switch would hit the
 * update server — and someone going back and forth between the app and a
 * message would do it a dozen times a minute.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000

/**
 * Offers the reload once a new version has finished downloading. It never
 * reloads on its own: restarting mid-checkout or mid-message would throw away
 * what the person was doing, and an update is never worth that.
 */
export function UpdatePrompt() {
  // Inert in development and in any build without the module: the hook below
  // only ever runs when both are available, so its call stays unconditional.
  if (!useUpdatesState || !Updates?.isEnabled) {
    return null
  }
  return <UpdateBanner />
}

function UpdateBanner() {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const { isUpdatePending, isRestarting } = useUpdatesState!()
  const [dismissed, setDismissed] = useState(false)
  const slide = useRef(new Animated.Value(-120)).current
  const visible = isUpdatePending && !dismissed
  // Seeded at mount: the module already checks once at startup, and a check
  // in flight must not be started a second time.
  const lastCheck = useRef(Date.now())
  const checking = useRef(false)
  const pending = useRef(isUpdatePending)
  pending.current = isUpdatePending

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 0 : -120,
      useNativeDriver: true,
      damping: 18,
      stiffness: 140,
    }).start()
  }, [visible, slide])

  /**
   * The module only looks for an update at cold start. The common case is the
   * app being backgrounded, a version published, and the person coming back —
   * which used to surface nothing until they killed the app.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || checking.current || pending.current) {
        return
      }
      const now = Date.now()
      if (now - lastCheck.current < CHECK_INTERVAL_MS) {
        return
      }
      lastCheck.current = now
      checking.current = true
      void (async () => {
        try {
          const result = await Updates!.checkForUpdateAsync()
          if (result.isAvailable) {
            await Updates!.fetchUpdateAsync()
          }
        }
        catch {
          // Offline, or the server is unreachable. The next return to the
          // foreground tries again; nothing is worth saying here.
        }
        finally {
          checking.current = false
        }
      })()
    })
    return () => {
      subscription.remove()
    }
  }, [])

  const handleReload = useCallback(() => {
    Updates?.reloadAsync().catch(() => {
      // A failed reload leaves the running version in place; the update is
      // already downloaded and applies by itself at the next cold start.
      setDismissed(true)
    })
  }, [])

  if (!isUpdatePending && !isRestarting) {
    return null
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.band,
        {
          backgroundColor: semantic.bgPrimaryLight,
          paddingTop: insets.top + spacing[2],
          transform: [{ translateY: slide }],
        },
      ]}
    >
      <Download size={18} color={colors.green[600]} strokeWidth={2.2} />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: semantic.textPrimary }]}>
          Mise à jour prête
        </Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          Elle s'appliquera au prochain lancement.
        </Text>
      </View>
      <Pressable
        style={styles.action}
        onPress={handleReload}
        disabled={isRestarting}
        accessibilityRole="button"
        accessibilityLabel="Redémarrer maintenant pour appliquer la mise à jour"
      >
        {isRestarting
          ? <ActivityIndicator size="small" color={colors.neutral[0]} />
          : <Text style={styles.actionText}>Redémarrer</Text>}
      </Pressable>
      <Pressable
        style={styles.dismiss}
        onPress={() => setDismissed(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Plus tard"
      >
        <X size={16} color={semantic.textTertiary} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  texts: {
    flex: 1,
  },
  title: {
    ...typography.bodyL,
    fontFamily: fonts.sansSb,
  },
  subtitle: {
    ...typography.caption,
    marginTop: 1,
  },
  action: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    backgroundColor: colors.green[600],
  },
  actionText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
    color: colors.neutral[0],
  },
  dismiss: {
    padding: spacing[1],
  },
})
