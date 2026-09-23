import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { parseCheckoutMessage } from '../utils/checkout-widget'

/** Where the provider sends the browser once the payment ends. */
const RETURN_PATH = '/payments/callback'

/** How often we ask our own server whether the payment has landed. */
const POLL_INTERVAL_MS = 4000

export interface PaymentWebViewProps {
  /**
   * The provider's own page, opened server-side. Preferred over `html`: the
   * transaction is then ours before the buyer sees anything to pay with.
   */
  url?: string | null
  /** A page we build ourselves, for a provider that only offers a widget. */
  html?: string | null
  /**
   * The reference the server already holds. It is what gets confirmed — the
   * page's word on which transaction was paid is never taken.
   */
  transactionId?: string | null
  title?: string
  /**
   * Called once with the reference to confirm. The caller owns the
   * verification, because each wallet and the cart confirm on their own
   * endpoint; this component only decides *when*.
   */
  onSettled: (transactionId: string) => void | Promise<void>
  /** Back pressed, or the payment abandoned. */
  onCancel: () => void
  /**
   * Asks our server where the payment stands.
   *
   * This is the signal that actually holds. A hosted page may not redirect
   * at all — INTRAM's ends on its own receipt — and then the return URL
   * never fires. Our server can always ask the provider, so it is asked.
   *
   * The three answers matter: `pending` means keep waiting, `settled` closes
   * the screen, and `failed` closes it too. Treating a failure as « keep
   * waiting » left the buyer on a dead page whose only exit asked whether
   * they wanted to cancel a payment that had already failed.
   */
  pollStatus?: () => Promise<'settled' | 'pending' | 'failed'>
}

/**
 * The one screen that shows a payment, wherever a payment is taken.
 *
 * Four places used to carry their own copy — the cart and three wallets — and
 * each had to be taught separately what a provider's answer looks like. They
 * now differ only in where they confirm.
 *
 * Two shapes reach the same end. A hosted page says nothing to its host, so
 * the return URL is the signal; a widget we host speaks through
 * `postMessage`. Either way what is reported upwards is a reference, and
 * whether it was really paid is the server's business.
 */
export function PaymentWebView({
  url,
  html,
  transactionId,
  title = 'Paiement sécurisé',
  onSettled,
  onCancel,
  pollStatus,
}: PaymentWebViewProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  // Guards the double signal: a hosted page can fire the return URL twice
  // (redirect then history entry), and confirming twice is a support ticket.
  const [settled, setSettled] = useState(false)

  const settle = useCallback((reference: string) => {
    if (settled) {
      return
    }
    setSettled(true)
    void onSettled(reference)
  }, [settled, onSettled])

  // Polls while the screen is open. Stops as soon as it settles, and never
  // outlives the screen — an interval left running would confirm a payment
  // the buyer has already walked away from.
  const pollRef = useRef(pollStatus)
  pollRef.current = pollStatus

  useEffect(() => {
    if (settled || pollStatus === undefined) {
      return
    }
    let cancelled = false
    const timer = setInterval(() => {
      void (async () => {
        try {
          const status = await pollRef.current?.()
          if (cancelled) {
            return
          }
          if (status === 'settled') {
            settle(transactionId ?? '')
          }
          else if (status === 'failed') {
            setSettled(true)
            appAlert('Paiement échoué', 'Le paiement n\'a pas abouti. Aucun montant n\'a été débité.')
            onCancel()
          }
        }
        catch {
          // Offline for a moment: the next tick asks again.
        }
      })()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [settled, pollStatus, transactionId, settle, onCancel])

  const confirmCancel = useCallback(() => {
    appAlert(
      'Annuler le paiement ?',
      'Vous pourrez le reprendre plus tard.',
      [
        { text: 'Continuer le paiement', style: 'cancel' },
        { text: 'Annuler', style: 'destructive', onPress: onCancel },
      ],
    )
  }, [onCancel])

  /** Hosted page: the return URL is the only thing it tells us. */
  const handleNavigation = useCallback((state: { url: string }) => {
    if (!url || !state.url.includes(RETURN_PATH) || !transactionId) {
      return
    }
    settle(transactionId)
  }, [url, transactionId, settle])

  /** Embedded widget: it reports through `postMessage`. */
  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    const message = parseCheckoutMessage(event.nativeEvent.data)
    if (!message) {
      console.warn('[paiement] message illisible du widget:', event.nativeEvent.data)
      return
    }
    if (message.type === 'debug') {
      // The provider's raw answer, kept visible while an integration is
      // still being proven rather than guessed at.
      console.warn('[paiement] réponse brute du widget:', message.payload)
      return
    }
    if (message.type === 'completed') {
      settle(transactionId ?? message.transactionId)
      return
    }
    if (message.type === 'failed') {
      appAlert('Paiement échoué', message.reason ?? 'Le paiement a échoué.')
      onCancel()
      return
    }
    onCancel()
  }, [transactionId, settle, onCancel])

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <View style={[styles.header, { paddingTop: insets.top, backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={confirmCancel}
          accessibilityRole="button"
          accessibilityLabel="Annuler le paiement"
        >
          <ArrowLeft size={22} color={semantic.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: semantic.textPrimary }]}>{title}</Text>
        <View style={styles.backButton} />
      </View>

      {/* The provider's page ends with its pay button, and the gesture bar
          sat over it. The inset belongs under the WebView, not inside it:
          a page we do not control cannot be asked to leave room. */}
      <WebView
        style={styles.webView}
        containerStyle={{ paddingBottom: insets.bottom }}
        source={url ? { uri: url } : { html: html ?? '' }}
        onNavigationStateChange={handleNavigation}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={[styles.loading, { backgroundColor: semantic.bgPage }]}>
            <ActivityIndicator size="large" color={colors.green[400]} />
            <Text style={[styles.loadingText, { color: semantic.textSecondary }]}>
              Chargement du paiement…
            </Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    paddingBottom: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.bodyL,
    fontFamily: fonts.sansSb,
    flex: 1,
    textAlign: 'center',
  },
  webView: {
    flex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[3],
  },
  loadingText: {
    ...typography.bodyS,
  },
})
