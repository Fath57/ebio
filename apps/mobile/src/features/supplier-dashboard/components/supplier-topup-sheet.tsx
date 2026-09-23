import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { PaymentWebView } from '../../payments/components/payment-web-view'
import { buildTopupCheckoutHtml, TOPUP_PRESETS } from '../../wallet/utils/topup-checkout'
import { readApiError } from '../utils/read-api-error'

export const MIN_TOPUP = 100
const MAX_TOPUP = 1_000_000

interface SupplierTopupSheetProps {
  visible: boolean
  onClose: () => void
  /**
   * Amount to pre-fill (e.g. what is missing to pay a banner). Suggested as
   * the first preset when it is not already one.
   */
  suggestedAmount?: number
  /** Optional hint displayed under the title (defaults to the FedaPay note). */
  hint?: string
  /** Called after the server confirmed the FedaPay payment; `balance` is the new wallet balance. */
  onVerified: (balance: number) => void
}

/**
 * Shop wallet top-up: amount picker (bottom sheet) followed by the FedaPay
 * Checkout.js page rendered full-screen in a WebView. The server re-checks
 * the transaction before crediting; the widget's word alone is never trusted.
 */
export function SupplierTopupSheet({ visible, onClose, suggestedAmount = 0, hint, onVerified }: SupplierTopupSheetProps) {
  const { semantic } = useTheme()
  const { data: session } = useSession()
  const fedapayPublicKey = process.env.EXPO_PUBLIC_FEDAPAY_PUBLIC_KEY ?? null
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // FedaPay page currently open; `pendingTopupId` is the server-side top-up it pays for.
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null)
  /** The provider's own page, when it hands one over. */
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  /** Reference held by the server, the only one we confirm with. */
  const [providerTransactionId, setProviderTransactionId] = useState<string | null>(null)
  const [pendingTopupId, setPendingTopupId] = useState<string | null>(null)

  // Pre-fill the suggested amount each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setAmount(suggestedAmount > 0 ? String(suggestedAmount) : '')
    }
  }, [visible, suggestedAmount])

  const value = Number(amount)
  const isValid = !Number.isNaN(value) && Number.isInteger(value) && value >= MIN_TOPUP && value <= MAX_TOPUP
  const presets = suggestedAmount > 0 && !TOPUP_PRESETS.includes(suggestedAmount)
    ? [suggestedAmount, ...TOPUP_PRESETS.filter(preset => preset > suggestedAmount)].slice(0, 4)
    : TOPUP_PRESETS

  const startTopup = useCallback(async () => {
    if (!fedapayPublicKey) {
      appAlert('Recharge indisponible', 'Le paiement en ligne n’est pas configuré sur cette version de l’application.')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await apiFetch('/api/suppliers/me/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amount: value }),
      })
      if (!res.ok) {
        appAlert('Recharge impossible', await readApiError(res))
        return
      }
      const data = await res.json() as {
        topupId: string
        amount: number
        paymentUrl?: string | null
        providerTransactionId?: string | null
      }
      setPendingTopupId(data.topupId)
      setPaymentUrl(data.paymentUrl ?? null)
      setProviderTransactionId(data.providerTransactionId ?? null)
      // Only a widget-based provider leaves the page to us to build.
      setCheckoutHtml(data.paymentUrl
        ? null
        : buildTopupCheckoutHtml(
            fedapayPublicKey,
            data.amount,
            data.topupId,
            session?.user?.name ?? 'Boutique eBio',
            session?.user?.email ?? null,
          ))
    }
    catch {
      appAlert('Recharge impossible', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setIsSubmitting(false)
    }
  }, [fedapayPublicKey, value, session])

  const closeCheckout = useCallback(() => {
    setCheckoutHtml(null)
    setPaymentUrl(null)
    setProviderTransactionId(null)
    setPendingTopupId(null)
    onClose()
  }, [onClose])

  /** Silent check: the verify endpoint only succeeds once the money landed. */
  const pollTopupStatus = useCallback(async (): Promise<'settled' | 'pending' | 'failed'> => {
    if (!pendingTopupId || !providerTransactionId) {
      return 'pending'
    }
    const res = await apiFetch(`/api/suppliers/me/wallet/topups/${pendingTopupId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ fedapayTransactionId: providerTransactionId }),
    })
    if (res.ok) {
      return 'settled'
    }
    const body = await res.json().catch(() => null) as { code?: string } | null
    return body?.code === 'payment_failed' ? 'failed' : 'pending'
  }, [pendingTopupId, providerTransactionId])

  const confirmTopup = useCallback(async (reference: string) => {
    if (!pendingTopupId) {
      closeCheckout()
      return
    }
    try {
      const res = await apiFetch(`/api/suppliers/me/wallet/topups/${pendingTopupId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ fedapayTransactionId: reference }),
      })
      if (res.ok) {
        const data = await res.json() as { status: string, balance: number }
        closeCheckout()
        onVerified(data.balance)
        return
      }
      appAlert('Vérification échouée', await readApiError(res))
    }
    catch {
      appAlert('Vérification échouée', 'La recharge sera vérifiée automatiquement.')
    }
    closeCheckout()
  }, [pendingTopupId, closeCheckout, onVerified])

  return (
    <>
      <Modal visible={visible && !checkoutHtml && !paymentUrl} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAwareView style={styles.overlay}>
          <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.title, { color: semantic.textPrimary }]}>Recharger mon portefeuille</Text>
            <Text style={[styles.hint, { color: semantic.textSecondary }]}>
              {hint ?? 'Le paiement passe par FedaPay (Mobile Money ou carte). Le solde est crédité dès la confirmation.'}
            </Text>
            <View style={styles.presetRow}>
              {presets.map(preset => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: semantic.bgSurface,
                      borderColor: amount === String(preset) ? colors.green[400] : semantic.borderNormal,
                    },
                  ]}
                  onPress={() => setAmount(String(preset))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: amount === String(preset) }}
                  accessibilityLabel={`${preset.toLocaleString('fr-FR')} FCFA`}
                >
                  <Text style={[styles.presetText, { color: semantic.textPrimary }]}>
                    {preset.toLocaleString('fr-FR')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
              placeholder="Autre montant (FCFA)"
              placeholderTextColor={semantic.textTertiary}
              keyboardType="number-pad"
              value={amount}
              onChangeText={setAmount}
              accessibilityLabel="Montant de la recharge"
            />
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancel}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Annuler"
              >
                <Text style={[styles.cancelText, { color: semantic.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirm, (isSubmitting || !isValid) && styles.buttonDisabled]}
                disabled={isSubmitting || !isValid}
                onPress={startTopup}
                accessibilityRole="button"
                accessibilityLabel="Continuer"
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                  : <Text style={styles.confirmText}>Continuer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareView>
      </Modal>

      <Modal visible={checkoutHtml !== null || paymentUrl !== null} animationType="slide" onRequestClose={closeCheckout}>
        <PaymentWebView
          url={paymentUrl}
          html={checkoutHtml}
          transactionId={providerTransactionId}
          title="Recharge du portefeuille"
          onSettled={confirmTopup}
          onCancel={closeCheckout}
          pollStatus={pollTopupStatus}
        />
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing[5],
    paddingBottom: spacing[8],
    gap: spacing[2],
  },
  title: { ...typography.h2 },
  hint: { ...typography.bodyS },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    ...typography.bodyL,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  presetChip: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: { ...typography.bodyS, fontFamily: fonts.sansSb },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  cancel: { minHeight: 44, paddingVertical: spacing[3], paddingHorizontal: spacing[4], justifyContent: 'center' },
  cancelText: { ...typography.h3 },
  confirm: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { ...typography.h3, color: colors.neutral[0] },
  buttonDisabled: { opacity: 0.5 },
  checkout: { flex: 1 },
})
