import type { CourierPayoutNumber } from '../hooks/use-courier-wallet'
import { useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { TOPUP_PRESETS } from '../../wallet/utils/topup-checkout'

export const MIN_WITHDRAWAL = 1000
export const MIN_TOPUP = 100

interface SheetProps {
  visible: boolean
  onClose: () => void
}

/** Bottom sheet chrome shared by the three wallet forms. */
function Sheet({ visible, onClose, children }: SheetProps & { children: React.ReactNode }) {
  const { semantic } = useTheme()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAwareView style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: semantic.bgCard }]}>
          {children}
        </View>
      </KeyboardAwareView>
    </Modal>
  )
}

interface SheetActionsProps {
  confirmLabel: string
  disabled: boolean
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: () => void
}

function SheetActions({ confirmLabel, disabled, isSubmitting, onCancel, onConfirm }: SheetActionsProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.modalActions}>
      <TouchableOpacity
        style={styles.modalCancel}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Annuler"
      >
        <Text style={[styles.modalCancelText, { color: semantic.textSecondary }]}>Annuler</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.modalConfirm, (isSubmitting || disabled) && styles.buttonDisabled]}
        disabled={isSubmitting || disabled}
        onPress={onConfirm}
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
      >
        {isSubmitting
          ? <ActivityIndicator size="small" color={colors.neutral[0]} />
          : <Text style={styles.modalConfirmText}>{confirmLabel}</Text>}
      </TouchableOpacity>
    </View>
  )
}

// ===== Add payout number =====

interface AddNumberSheetProps extends SheetProps {
  onSubmit: (phoneNumber: string, holderName: string) => Promise<boolean>
}

export function AddNumberSheet({ visible, onClose, onSubmit }: AddNumberSheetProps) {
  const { semantic } = useTheme()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [holderName, setHolderName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isValid = phoneNumber.trim().length >= 8 && holderName.trim().length >= 2

  async function submit() {
    setIsSubmitting(true)
    try {
      const done = await onSubmit(phoneNumber, holderName)
      if (done) {
        setPhoneNumber('')
        setHolderName('')
      }
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={[styles.modalTitle, { color: semantic.textPrimary }]}>Nouveau numéro</Text>
      <Text style={[styles.modalHint, { color: semantic.textSecondary }]}>
        L'opérateur est détecté d'après le numéro. eBio vérifie ensuite que le numéro vous appartient.
      </Text>
      <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Numéro Mobile Money</Text>
      <TextInput
        style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
        placeholder="0190123456"
        placeholderTextColor={semantic.textTertiary}
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        accessibilityLabel="Numéro Mobile Money"
      />
      <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Nom du titulaire</Text>
      <TextInput
        style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
        placeholder="Tel qu'enregistré chez l'opérateur"
        placeholderTextColor={semantic.textTertiary}
        value={holderName}
        onChangeText={setHolderName}
        accessibilityLabel="Nom du titulaire"
      />
      <SheetActions
        confirmLabel="Enregistrer"
        disabled={!isValid}
        isSubmitting={isSubmitting}
        onCancel={onClose}
        onConfirm={submit}
      />
    </Sheet>
  )
}

// ===== Withdrawal request =====

interface WithdrawSheetProps extends SheetProps {
  balance: number
  validatedNumbers: CourierPayoutNumber[]
  onSubmit: (payoutNumberId: string, amount: number) => Promise<boolean>
}

export function WithdrawSheet({ visible, onClose, balance, validatedNumbers, onSubmit }: WithdrawSheetProps) {
  const { semantic } = useTheme()
  const [amount, setAmount] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Default to the first validated number until the courier picks another.
  const numberId = pickedId ?? validatedNumbers[0]?.id ?? null
  const value = Number(amount)
  const isValid = numberId !== null
    && !Number.isNaN(value)
    && value >= MIN_WITHDRAWAL
    && value <= balance

  async function submit() {
    if (!numberId) {
      return
    }
    setIsSubmitting(true)
    try {
      const done = await onSubmit(numberId, value)
      if (done) {
        setAmount('')
        setPickedId(null)
      }
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={[styles.modalTitle, { color: semantic.textPrimary }]}>Demander un reversement</Text>
      <Text style={[styles.modalHint, { color: semantic.textSecondary }]}>
        Le montant est réservé immédiatement et versé sur votre Mobile Money après validation par eBio.
      </Text>
      <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Verser sur</Text>
      {validatedNumbers.map(number => (
        <TouchableOpacity
          key={number.id}
          style={[
            styles.numberPick,
            {
              backgroundColor: semantic.bgSurface,
              borderColor: numberId === number.id ? colors.green[400] : semantic.borderNormal,
            },
          ]}
          onPress={() => setPickedId(number.id)}
          accessibilityRole="radio"
          accessibilityState={{ selected: numberId === number.id }}
          accessibilityLabel={`${number.phoneNumber} ${number.operatorLabel}`}
        >
          <Text style={[styles.numberPhone, { color: semantic.textPrimary }]}>{number.phoneNumber}</Text>
          <Text style={[styles.numberMeta, { color: semantic.textTertiary }]}>{number.operatorLabel}</Text>
        </TouchableOpacity>
      ))}
      <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Montant (FCFA)</Text>
      <TextInput
        style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
        placeholder={`Entre ${MIN_WITHDRAWAL.toLocaleString('fr-FR')} et ${balance.toLocaleString('fr-FR')}`}
        placeholderTextColor={semantic.textTertiary}
        keyboardType="number-pad"
        value={amount}
        onChangeText={setAmount}
        accessibilityLabel="Montant du reversement"
      />
      <SheetActions
        confirmLabel="Confirmer"
        disabled={!isValid}
        isSubmitting={isSubmitting}
        onCancel={onClose}
        onConfirm={submit}
      />
    </Sheet>
  )
}

// ===== Top-up =====

interface TopupSheetProps extends SheetProps {
  /** Amount owed when the balance is negative; suggested as the first preset. */
  debt: number
  onSubmit: (amount: number) => Promise<boolean>
}

export function TopupSheet({ visible, onClose, debt, onSubmit }: TopupSheetProps) {
  const { semantic } = useTheme()
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const value = Number(amount)
  const isValid = !Number.isNaN(value) && value >= MIN_TOPUP
  const presets = debt > 0 && !TOPUP_PRESETS.includes(debt)
    ? [debt, ...TOPUP_PRESETS.filter(preset => preset > debt)].slice(0, 4)
    : TOPUP_PRESETS

  async function submit() {
    setIsSubmitting(true)
    try {
      const done = await onSubmit(value)
      if (done) {
        setAmount('')
      }
    }
    finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={[styles.modalTitle, { color: semantic.textPrimary }]}>Recharger mon portefeuille</Text>
      <Text style={[styles.modalHint, { color: semantic.textSecondary }]}>
        {debt > 0
          ? `Vous devez ${debt.toLocaleString('fr-FR')} FCFA de commission eBio. Le paiement passe par FedaPay (Mobile Money ou carte).`
          : 'Le paiement passe par FedaPay (Mobile Money ou carte). Le solde est crédité dès la confirmation.'}
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
      <SheetActions
        confirmLabel="Continuer"
        disabled={!isValid}
        isSubmitting={isSubmitting}
        onCancel={onClose}
        onConfirm={submit}
      />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing[5],
    paddingBottom: spacing[8],
    gap: spacing[2],
  },
  modalTitle: { ...typography.h2 },
  modalHint: { ...typography.bodyS },
  inputLabel: { ...typography.caption, marginTop: spacing[2] },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    ...typography.bodyL,
  },
  numberPick: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[1],
  },
  numberPhone: { ...typography.bodyL, fontFamily: fonts.sansSb },
  numberMeta: { ...typography.caption },
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  modalCancel: { minHeight: 44, paddingVertical: spacing[3], paddingHorizontal: spacing[4], justifyContent: 'center' },
  modalCancelText: { ...typography.h3 },
  modalConfirm: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { ...typography.h3, color: colors.neutral[0] },
  buttonDisabled: { opacity: 0.5 },
})
