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
  const {
    isUpdatePending,
    isRestarting,
    isDownloading,
    downloadError,
  } = useUpdatesState!()
  const [dismissed, setDismissed] = useState(false)
  /**
   * A download of ours that did not finish.
   *
   * The module reports its own failures through `downloadError`, but the
   * fetch started below is ours, and its failure was swallowed — so a version
   * waiting on the server stayed invisible to someone whose network dropped
   * mid-download.
   */
  const [failed, setFailed] = useState(false)
  const slide = useRef(new Animated.Value(-120)).current
  const visible = (isUpdatePending || ((failed || downloadError !== undefined) && !isUpdatePending)) && !dismissed
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
            setFailed(false)
          }
        }
        catch {
          // Offline mid-download, no room left, a bundle that would not
          // apply. Saying nothing left someone on an old version with no way
          // to know one was waiting — the band below offers to try again.
          setFailed(true)
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

  /**
   * Tries the download again, on demand.
   *
   * The automatic attempt happens on returning to the app and no more often
   * than every few minutes; someone who has just reconnected should not have
   * to wait for that, nor guess that waiting is what is needed.
   */
  const handleRetry = useCallback(() => {
    setFailed(false)
    void (async () => {
      try {
        const result = await Updates!.checkForUpdateAsync()
        if (result.isAvailable) {
          await Updates!.fetchUpdateAsync()
        }
      }
      catch {
        setFailed(true)
      }
    })()
  }, [])

  const handleReload = useCallback(() => {
    Updates?.reloadAsync().catch(() => {
      // A failed reload leaves the running version in place; the update is
      // already downloaded and applies by itself at the next cold start.
      setDismissed(true)
    })
  }, [])

  // Two things worth interrupting for: a version ready to apply, and a
  // version that exists but could not be fetched. Everything else — checking,
  // downloading — happens quietly.
  const stuck = (failed || downloadError !== undefined) && !isUpdatePending
  if (!isUpdatePending && !isRestarting && !stuck) {
    return null
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.band,
        {
          backgroundColor: stuck ? colors.earth[50] : semantic.bgPrimaryLight,
          paddingTop: insets.top + spacing[2],
          transform: [{ translateY: slide }],
        },
      ]}
    >
      <Download size={18} color={stuck ? colors.earth[600] : colors.green[600]} strokeWidth={2.2} />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: semantic.textPrimary }]}>
          {stuck ? 'Mise à jour disponible' : 'Mise à jour prête'}
        </Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          {stuck
            ? 'Le téléchargement n\'a pas abouti. Vérifiez votre connexion.'
            : 'Elle s\'appliquera au prochain lancement.'}
        </Text>
      </View>
      {stuck
        ? (
            <Pressable
              style={[styles.action, { backgroundColor: colors.earth[600] }]}
              onPress={handleRetry}
              disabled={isDownloading}
              accessibilityRole="button"
              accessibilityLabel="Réessayer de télécharger la mise à jour"
            >
              {isDownloading
                ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                : <Text style={styles.actionText}>Réessayer</Text>}
            </Pressable>
          )
        : (
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
          )}
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
