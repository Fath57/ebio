import type { FamilyTopupStart } from '../family-wallet-api'
import CreditCard from 'lucide-react-native/dist/esm/icons/credit-card'
import Wallet from 'lucide-react-native/dist/esm/icons/wallet'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { formatXof, useMoney } from '../../common/hooks/use-money'
import {
  FAMILY_TOPUP_MAX,
  FAMILY_TOPUP_MIN,
  FAMILY_TOPUP_PRESETS,
  fetchPersonalBalance,
  startFamilyTopup,
  transferToFamilyWallet,
} from '../family-wallet-api'

type TopupSource = 'CARD' | 'PERSONAL'

interface FamilyTopupSheetProps {
  visible: boolean
  onClose: () => void
  /** The card payment was opened server-side: the parent shows the payment page. */
  onCheckout: (start: FamilyTopupStart) => void
  /** Money moved from the personal wallet: the parent reloads. */
  onTransferred: (amount: number) => void
}

const TABS: { value: TopupSource, label: string }[] = [
  { value: 'CARD', label: 'Carte ou Mobile Money' },
  { value: 'PERSONAL', label: 'Depuis mon portefeuille eBio' },
]

/** First problem of the typed amount, or null when it can be sent. */
function amountProblem(amount: number, source: TopupSource, personalBalance: number | null): string | null {
  if (!Number.isFinite(amount) || amount < FAMILY_TOPUP_MIN || amount > FAMILY_TOPUP_MAX)
    return `Le montant doit être compris entre ${formatXof(FAMILY_TOPUP_MIN)} et ${formatXof(FAMILY_TOPUP_MAX)}.`
  if (source === 'PERSONAL' && personalBalance !== null && amount > personalBalance)
    return `Votre portefeuille eBio contient ${formatXof(personalBalance)} : choisissez un montant plus petit.`
  return null
}

/**
 * Recharge of the family wallet: by card or Mobile Money (the payment page is
 * shown by the parent, like the personal wallet), or by an immediate transfer
 * from the payer's own eBio wallet.
 */
export function FamilyTopupSheet({ visible, onClose, onCheckout, onTransferred }: FamilyTopupSheetProps) {
  const { semantic } = useTheme()
  const { formatMoney, currency } = useMoney()
  const [source, setSource] = useState<TopupSource>('CARD')
  const [amountText, setAmountText] = useState('')
  const [personalBalance, setPersonalBalance] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!visible)
      return
    let cancelled = false
    async function load(): Promise<void> {
      const balance = await fetchPersonalBalance()
      if (!cancelled)
        setPersonalBalance(balance)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [visible])

  const amount = Number(amountText.replace(/\s/g, ''))
  const hasAmount = amountText.trim().length > 0

  const close = useCallback(() => {
    setAmountText('')
    onClose()
  }, [onClose])

  const submit = useCallback(async () => {
    const problem = amountProblem(amount, source, personalBalance)
    if (problem) {
      appAlert('Montant invalide', problem)
      return
    }
    setSubmitting(true)
    try {
      if (source === 'PERSONAL') {
        const result = await transferToFamilyWallet(amount)
        if (result.error !== null) {
          appAlert('Virement impossible', result.error)
          return
        }
        setAmountText('')
        onTransferred(amount)
        return
      }
      const result = await startFamilyTopup(amount)
      if (result.error !== null) {
        appAlert('Recharge impossible', result.error)
        return
      }
      if (!result.data.paymentUrl) {
        appAlert('Recharge impossible', 'La page de paiement n’a pas pu être ouverte. Réessayez dans un instant.')
        return
      }
      setAmountText('')
      onCheckout(result.data)
    }
    finally {
      setSubmitting(false)
    }
  }, [amount, source, personalBalance, onTransferred, onCheckout])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAwareView style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
          <Text style={[styles.title, { color: semantic.textPrimary }]}>Recharger le portefeuille famille</Text>

          <View style={[styles.tabs, { backgroundColor: semantic.bgPage }]} accessibilityRole="tablist">
            {TABS.map((tab) => {
              const active = source === tab.value
              const Icon = tab.value === 'CARD' ? CreditCard : Wallet
              return (
                <TouchableOpacity
                  key={tab.value}
                  style={[styles.tab, active && { backgroundColor: semantic.bgCard, borderColor: colors.green[400] }]}
                  onPress={() => setSource(tab.value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Icon size={16} color={active ? colors.green[600] : semantic.textSecondary} strokeWidth={2} />
                  <Text
                    style={[styles.tabText, { color: active ? colors.green[600] : semantic.textSecondary }]}
                    numberOfLines={2}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={[styles.hint, { color: semantic.textSecondary }]}>
            {source === 'CARD'
              ? 'Paiement par carte bancaire ou Mobile Money. Le portefeuille est crédité dès la confirmation.'
              : personalBalance === null
                ? 'Virement immédiat depuis votre portefeuille eBio, sans frais.'
                : `Virement immédiat, sans frais. Disponible : ${formatXof(personalBalance)}.`}
          </Text>

          <View style={styles.presetRow}>
            {FAMILY_TOPUP_PRESETS.map((preset) => {
              const selected = amountText === String(preset)
              return (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: selected ? semantic.bgPrimaryLight : semantic.bgSurface,
                      borderColor: selected ? colors.green[400] : semantic.borderNormal,
                    },
                  ]}
                  onPress={() => setAmountText(String(preset))}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${formatXof(preset)}${currency === 'XOF' ? '' : `, environ ${formatMoney(preset).primary}`}`}
                >
                  <Text style={[styles.presetText, { color: semantic.textPrimary }]}>
                    {preset.toLocaleString('fr-FR')}
                  </Text>
                  {currency !== 'XOF' && (
                    <Text style={[styles.presetSecondary, { color: semantic.textSecondary }]}>
                      {`≈ ${formatMoney(preset).primary}`}
                    </Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Montant (FCFA)</Text>
          <TextInput
            style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
            placeholder={`De ${formatXof(FAMILY_TOPUP_MIN)} à ${formatXof(FAMILY_TOPUP_MAX)}`}
            placeholderTextColor={semantic.textTertiary}
            keyboardType="number-pad"
            value={amountText}
            onChangeText={setAmountText}
            accessibilityLabel="Montant de la recharge en FCFA"
          />
          {currency !== 'XOF' && amount > 0 && source === 'CARD' && (
            <Text style={[styles.hint, { color: semantic.textSecondary }]}>
              {`Soit environ ${formatMoney(amount).primary}. Votre banque convertit au taux du jour : le montant prélevé peut différer légèrement ; vous serez débité de ${formatXof(amount)}.`}
            </Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={close} accessibilityRole="button">
              <Text style={[styles.cancelText, { color: semantic.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirm, (submitting || !hasAmount) && styles.disabled]}
              disabled={submitting || !hasAmount}
              onPress={() => {
                void submit()
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting || !hasAmount, busy: submitting }}
            >
              {submitting
                ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                : <Text style={styles.confirmText}>{source === 'CARD' ? 'Continuer' : 'Virer'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareView>
    </Modal>
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
  tabs: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: spacing[1],
    gap: spacing[1],
    marginTop: spacing[2],
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[2],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabText: { ...typography.caption, fontFamily: fonts.sansSb, flexShrink: 1 },
  hint: { ...typography.bodyS },
  label: { ...typography.caption, marginTop: spacing[2] },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  presetChip: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: { ...typography.bodyS, fontFamily: fonts.mono },
  presetSecondary: { ...typography.caption, fontFamily: fonts.mono },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    ...typography.bodyL,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[4] },
  cancelText: { ...typography.h3 },
  confirm: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingHorizontal: spacing[5],
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { ...typography.h3, color: colors.neutral[0] },
  disabled: { opacity: 0.5 },
})
