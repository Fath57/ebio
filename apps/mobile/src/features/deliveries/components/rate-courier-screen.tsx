import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { StarRating } from '../../common/components/star-rating'

export type RateCourierMode = 'rate' | 'tip'

interface RateCourierScreenProps {
  deliveryId: string
  courierName: string
  /** `rate` starts with the stars then offers a tip; `tip` skips the rating. */
  mode: RateCourierMode
  onDone: () => void
  onBack: () => void
  /** Personal wallet screen, offered when the balance cannot cover the tip. */
  onOpenWallet: () => void
}

const TIP_PRESETS = [200, 500, 1000] as const
const TIP_MIN = 100
const TIP_MAX = 50000
const COMMENT_MAX = 500
/** How long the "merci" confirmation stays before the screen closes itself. */
const SUCCESS_DELAY_MS = 1500

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** Reads the API error message, falling back to a generic French sentence. */
async function readError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string } | null
  return body?.message ?? 'Une erreur est survenue. Réessayez.'
}

/**
 * Two-step flow after a delivery: rate the courier (1-5 stars, optional
 * comment), then optionally leave a tip debited from the personal wallet.
 */
export function RateCourierScreen({ deliveryId, courierName, mode, onDone, onBack, onOpenWallet }: RateCourierScreenProps) {
  // The tab bar floats over the content: without its height the last
  // row sits underneath it.
  const tabBarHeight = useBottomTabBarHeight()
  const { semantic } = useTheme()
  const [step, setStep] = useState<'rate' | 'tip' | 'success'>(mode)

  // Rating step
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)

  // Tip step
  const [preset, setPreset] = useState<number | null>(TIP_PRESETS[1])
  const [customText, setCustomText] = useState('')
  const [balance, setBalance] = useState<number | null>(null)
  const [submittingTip, setSubmittingTip] = useState(false)
  const [tipError, setTipError] = useState<string | null>(null)
  const [insufficient, setInsufficient] = useState(false)

  const amount = preset ?? (customText ? Number.parseInt(customText, 10) : 0)
  const amountValid = Number.isInteger(amount) && amount >= TIP_MIN && amount <= TIP_MAX

  const loadBalance = useCallback(async () => {
    try {
      const res = await apiFetch('/api/wallet/me')
      if (res.ok) {
        const data = await res.json() as { balance: number }
        setBalance(data.balance)
      }
    }
    catch {
      // The balance line simply stays empty.
    }
  }, [])

  // Refreshed on focus: the buyer may come back from a wallet top-up.
  useFocusEffect(
    useCallback(() => {
      if (step === 'tip') {
        loadBalance()
      }
    }, [step, loadBalance]),
  )

  useEffect(() => {
    if (step !== 'success') {
      return undefined
    }
    const timer = setTimeout(onDone, SUCCESS_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [step, onDone])

  async function submitRating() {
    if (rating === 0 || submittingRating) {
      return
    }
    setSubmittingRating(true)
    setRatingError(null)
    try {
      const res = await apiFetch(`/api/deliveries/${deliveryId}/rate`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
        }),
      })
      if (res.ok || res.status === 409) {
        // Already rated: the tip is still worth offering.
        setStep('tip')
      }
      else {
        setRatingError(await readError(res))
      }
    }
    catch {
      setRatingError('Vérifiez votre connexion.')
    }
    finally {
      setSubmittingRating(false)
    }
  }

  async function submitTip() {
    if (!amountValid || submittingTip) {
      return
    }
    setSubmittingTip(true)
    setTipError(null)
    setInsufficient(false)
    try {
      const res = await apiFetch(`/api/deliveries/${deliveryId}/tip`, {
        method: 'POST',
        body: JSON.stringify({ amount }),
      })
      if (res.ok) {
        setStep('success')
        return
      }
      const message = await readError(res)
      if (res.status === 400 && message.toLowerCase().includes('solde insuffisant')) {
        setInsufficient(true)
      }
      setTipError(message)
    }
    catch {
      setTipError('Vérifiez votre connexion.')
    }
    finally {
      setSubmittingTip(false)
    }
  }

  function selectPreset(value: number) {
    setPreset(value)
    setCustomText('')
  }

  function changeCustom(text: string) {
    setCustomText(text.replace(/\D/g, ''))
    setPreset(null)
  }

  if (step === 'success') {
    return (
      <View style={[styles.successScreen, { backgroundColor: semantic.bgPage }]}>
        <View style={[styles.successIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
          <CircleCheck size={40} color={colors.green[600]} />
        </View>
        <Text style={[styles.successTitle, { color: semantic.textPrimary }]}>Merci ! Pourboire envoyé.</Text>
        <Text style={[styles.successBody, { color: semantic.textSecondary }]}>
          {`${courierName} recevra ${formatAmount(amount)} dans son portefeuille.`}
        </Text>
        <TouchableOpacity style={[styles.primaryButton, styles.successButton]} onPress={onDone} accessibilityRole="button" accessibilityLabel="Fermer">
          <Text style={styles.primaryText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (step === 'rate') {
    return (
      <>
        <ScreenHeader title="Noter le livreur" onBack={onBack} />
        <KeyboardAwareView style={{ flex: 1 }}>
          <ScrollView
            style={{ backgroundColor: semantic.bgPage }}
            contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.title, { color: semantic.textPrimary }]}>Comment s'est passée la livraison ?</Text>
            <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>{`Votre livreur : ${courierName}`}</Text>

            <View style={styles.starsRow}>
              <StarRating value={rating} readOnly={false} size={40} onChange={setRating} />
            </View>

            <Text style={[styles.fieldLabel, { color: semantic.textSecondary }]}>Commentaire (optionnel)</Text>
            <TextInput
              style={[styles.commentInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary }]}
              placeholder="Un mot sur la livraison..."
              placeholderTextColor={semantic.textTertiary}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={COMMENT_MAX}
              textAlignVertical="top"
            />
            <Text style={[styles.charCount, { color: semantic.textTertiary }]}>
              {`${comment.length}/${COMMENT_MAX}`}
            </Text>

            {ratingError
              ? <Text style={[styles.errorText, { color: colors.coral[600] }]}>{ratingError}</Text>
              : null}

            <TouchableOpacity
              style={[styles.primaryButton, (rating === 0 || submittingRating) && styles.disabled]}
              onPress={submitRating}
              disabled={rating === 0 || submittingRating}
              accessibilityRole="button"
              accessibilityLabel="Envoyer ma note"
            >
              <Text style={styles.primaryText}>{submittingRating ? 'Envoi...' : 'Envoyer ma note'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAwareView>
      </>
    )
  }

  return (
    <>
      <ScreenHeader title="Pourboire" onBack={onBack} />
      <KeyboardAwareView style={{ flex: 1 }}>
        <ScrollView
          style={{ backgroundColor: semantic.bgPage }}
          contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: semantic.textPrimary }]}>{`Laisser un pourboire à ${courierName} ?`}</Text>
          <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>100 % du pourboire est reversé au livreur.</Text>

          <View style={styles.chipsRow}>
            {TIP_PRESETS.map(value => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.chip,
                  { borderColor: semantic.borderNormal, backgroundColor: semantic.bgCard },
                  preset === value && { borderColor: colors.green[400], backgroundColor: semantic.bgPrimaryLight },
                ]}
                onPress={() => selectPreset(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: preset === value }}
                accessibilityLabel={`${value} FCFA`}
              >
                <Text style={[styles.chipText, { color: preset === value ? semantic.textPrimaryColor : semantic.textPrimary }]}>
                  {formatAmount(value)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { color: semantic.textSecondary }]}>Autre montant</Text>
          <TextInput
            style={[styles.amountInput, { borderColor: semantic.borderNormal, color: semantic.textPrimary }]}
            placeholder={`Entre ${TIP_MIN} et ${TIP_MAX.toLocaleString('fr-FR')} FCFA`}
            placeholderTextColor={semantic.textTertiary}
            value={customText}
            onChangeText={changeCustom}
            keyboardType="number-pad"
            maxLength={5}
          />
          {customText && !amountValid
            ? (
                <Text style={[styles.hint, { color: colors.coral[600] }]}>
                  {`Le pourboire doit être compris entre ${TIP_MIN} et ${TIP_MAX.toLocaleString('fr-FR')} FCFA.`}
                </Text>
              )
            : null}

          <Text style={[styles.balance, { color: semantic.textTertiary }]}>
            {balance === null ? 'Solde du portefeuille : …' : `Solde du portefeuille : ${formatAmount(balance)}`}
          </Text>

          {tipError
            ? (
                <View style={[styles.errorBox, { backgroundColor: colors.coral[50] }]}>
                  <Text style={[styles.errorBoxText, { color: colors.coral[800] }]}>{tipError}</Text>
                  {insufficient
                    ? (
                        <TouchableOpacity
                          style={[styles.walletButton, { borderColor: colors.coral[400] }]}
                          onPress={onOpenWallet}
                          accessibilityRole="button"
                          accessibilityLabel="Recharger mon portefeuille"
                        >
                          <Text style={[styles.walletButtonText, { color: colors.coral[800] }]}>Recharger mon portefeuille</Text>
                        </TouchableOpacity>
                      )
                    : null}
                </View>
              )
            : null}

          <TouchableOpacity
            style={[styles.primaryButton, (!amountValid || submittingTip) && styles.disabled]}
            onPress={submitTip}
            disabled={!amountValid || submittingTip}
            accessibilityRole="button"
            accessibilityLabel="Donner le pourboire"
          >
            <Text style={styles.primaryText}>
              {submittingTip ? 'Envoi...' : amountValid ? `Donner ${formatAmount(amount)}` : 'Donner un pourboire'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel="Pas cette fois"
          >
            <Text style={[styles.skipText, { color: semantic.textSecondary }]}>Pas cette fois</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAwareView>
    </>
  )
}

const styles = StyleSheet.create({
  content: { padding: spacing[4] },
  title: { ...typography.h2 },
  subtitle: { ...typography.bodyS, marginTop: spacing[2] },
  starsRow: {
    alignItems: 'center',
    paddingVertical: spacing[8],
  },
  fieldLabel: { ...typography.caption, marginTop: spacing[4], marginBottom: spacing[2] },
  commentInput: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
    padding: spacing[3],
    fontFamily: fonts.sans,
    fontSize: 15,
    minHeight: 100,
  },
  charCount: { ...typography.caption, textAlign: 'right', marginTop: spacing[1] },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[6],
  },
  chip: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: fonts.sansSb, fontSize: 14 },
  amountInput: {
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
    minHeight: 48,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  hint: { ...typography.caption, marginTop: spacing[1] },
  balance: { ...typography.caption, marginTop: spacing[3] },
  errorBox: {
    borderRadius: radius.md,
    padding: spacing[3],
    marginTop: spacing[4],
    gap: spacing[2],
  },
  errorBoxText: { ...typography.bodyS },
  walletButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletButtonText: { fontFamily: fonts.sansSb, fontSize: 13 },
  errorText: { ...typography.bodyS, marginTop: spacing[3] },
  primaryButton: {
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[6],
    minHeight: 48,
  },
  primaryText: { fontFamily: fonts.sansSb, fontSize: 14, color: colors.neutral[0] },
  disabled: { opacity: 0.4 },
  skipButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  skipText: { fontFamily: fonts.sansMd, fontSize: 14 },
  successScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  // The success view centres its children: the button must stretch itself.
  successButton: { alignSelf: 'stretch', paddingHorizontal: spacing[6] },
  successTitle: { ...typography.h2, textAlign: 'center' },
  successBody: { ...typography.bodyS, textAlign: 'center', marginTop: spacing[2] },
})
