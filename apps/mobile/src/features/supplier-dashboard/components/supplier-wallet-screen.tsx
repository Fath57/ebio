import ArrowDownToLine from 'lucide-react-native/dist/esm/icons/arrow-down-to-line'
import Phone from 'lucide-react-native/dist/esm/icons/phone'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'

const MIN_WITHDRAWAL = 1000

interface WalletData {
  id: string
  balance: number
  transactions: {
    items: Array<{
      id: string
      type: string
      amount: number
      balanceAfter: number
      description: string
      createdAt: string
    }>
  }
}

interface PayoutNumber {
  id: string
  phoneNumber: string
  operatorLabel: string
  holderName: string
  status: 'PENDING' | 'VALIDATED' | 'REJECTED'
  rejectionReason: string | null
}

interface Withdrawal {
  id: string
  amount: number
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'REJECTED' | 'CANCELLED'
  phoneNumber: string
  rejectionReason: string | null
  createdAt: string
}

const NUMBER_STATUS_LABELS: Record<PayoutNumber['status'], string> = {
  PENDING: 'En vérification',
  VALIDATED: 'Validé',
  REJECTED: 'Refusé',
}

const WITHDRAWAL_STATUS_LABELS: Record<Withdrawal['status'], string> = {
  PENDING: 'En attente',
  PROCESSING: 'Versement en cours',
  PAID: 'Versée',
  FAILED: 'Échouée',
  REJECTED: 'Refusée',
  CANCELLED: 'Annulée',
}

const WITHDRAWAL_STATUS_COLORS: Record<Withdrawal['status'], string> = {
  PENDING: colors.earth[600],
  PROCESSING: colors.blue[600],
  PAID: colors.green[600],
  FAILED: colors.coral[600],
  REJECTED: colors.coral[600],
  CANCELLED: colors.neutral[400],
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

interface SupplierWalletScreenProps {
  onGoBack: () => void
}

export function SupplierWalletScreen({ onGoBack }: SupplierWalletScreenProps) {
  const { semantic } = useTheme()
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [numbers, setNumbers] = useState<PayoutNumber[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // add-number modal
  const [isAddingNumber, setIsAddingNumber] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [holderName, setHolderName] = useState('')
  // withdraw modal
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawNumberId, setWithdrawNumberId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [walletRes, numbersRes, withdrawalsRes] = await Promise.all([
        apiFetch('/api/suppliers/me/wallet'),
        apiFetch('/api/suppliers/me/wallet/payout-numbers'),
        apiFetch('/api/suppliers/me/wallet/withdrawals'),
      ])
      if (walletRes.ok) {
        setWallet(await walletRes.json())
      }
      if (numbersRes.ok) {
        const data = await numbersRes.json() as { items: PayoutNumber[] }
        setNumbers(data.items)
      }
      if (withdrawalsRes.ok) {
        const data = await withdrawalsRes.json() as { items: Withdrawal[] }
        setWithdrawals(data.items)
      }
    }
    catch {
      // network failure: pull-to-refresh retries
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function readError(res: Response): Promise<string> {
    const body = await res.json().catch(() => null) as { message?: string, aggregateErrors?: Array<{ message?: string }> } | null
    return body?.aggregateErrors?.[0]?.message ?? body?.message ?? 'Une erreur est survenue'
  }

  const submitNumber = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const res = await apiFetch('/api/suppliers/me/wallet/payout-numbers', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phoneNumber.trim(), holderName: holderName.trim() }),
      })
      if (!res.ok) {
        appAlert('Numéro refusé', await readError(res))
        return
      }
      setIsAddingNumber(false)
      setPhoneNumber('')
      setHolderName('')
      appAlert('Numéro enregistré', 'eBio va vérifier que ce numéro vous appartient. Vous serez notifié une fois validé.')
      load()
    }
    finally {
      setIsSubmitting(false)
    }
  }, [phoneNumber, holderName, load])

  const deleteNumber = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/suppliers/me/wallet/payout-numbers/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      appAlert('Suppression impossible', await readError(res))
      return
    }
    load()
  }, [load])

  const submitWithdrawal = useCallback(async () => {
    if (!withdrawNumberId) {
      return
    }
    setIsSubmitting(true)
    try {
      const res = await apiFetch('/api/suppliers/me/wallet/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ payoutNumberId: withdrawNumberId, amount: Number(withdrawAmount) }),
      })
      if (!res.ok) {
        appAlert('Demande refusée', await readError(res))
        return
      }
      setIsWithdrawing(false)
      setWithdrawAmount('')
      appAlert('Demande envoyée', 'Le montant est réservé. Vous recevrez le versement sur votre Mobile Money après validation par eBio.')
      load()
    }
    finally {
      setIsSubmitting(false)
    }
  }, [withdrawNumberId, withdrawAmount, load])

  const cancelWithdrawal = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/suppliers/me/wallet/withdrawals/${id}/cancel`, { method: 'PATCH' })
    if (!res.ok) {
      appAlert('Annulation impossible', await readError(res))
      return
    }
    load()
  }, [load])

  const validatedNumbers = numbers.filter(number => number.status === 'VALIDATED')
  const balance = wallet?.balance ?? 0
  const hasActiveWithdrawal = withdrawals.some(w => w.status === 'PENDING' || w.status === 'PROCESSING')
  const canWithdraw = balance >= MIN_WITHDRAWAL && validatedNumbers.length > 0 && !hasActiveWithdrawal
  const withdrawValue = Number(withdrawAmount)
  const isWithdrawValid = withdrawNumberId !== null
    && !Number.isNaN(withdrawValue)
    && withdrawValue >= MIN_WITHDRAWAL
    && withdrawValue <= balance

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Portefeuille boutique" onBack={onGoBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true)
              load()
            }}
          />
        )}
      >
        {/* Balance */}
        <View style={[styles.balanceCard, { backgroundColor: semantic.bgCard }]}>
          <Text style={[styles.balanceLabel, { color: semantic.textSecondary }]}>Solde disponible</Text>
          <Text style={[styles.balanceValue, { color: balance < 0 ? colors.coral[600] : semantic.textPrimary }]}>
            {formatAmount(balance)}
          </Text>
          {balance < 0 && (
            <Text style={[styles.balanceHint, { color: semantic.textSecondary }]}>
              Solde négatif : commissions sur ventes en espèces, absorbées par vos prochaines ventes en ligne.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.withdrawButton, !canWithdraw && styles.buttonDisabled]}
            disabled={!canWithdraw}
            onPress={() => {
              setWithdrawNumberId(validatedNumbers[0]?.id ?? null)
              setIsWithdrawing(true)
            }}
            activeOpacity={0.8}
          >
            <ArrowDownToLine size={16} color={colors.neutral[0]} strokeWidth={2} />
            <Text style={styles.withdrawButtonText}>Demander un reversement</Text>
          </TouchableOpacity>
          <Text style={[styles.balanceHint, { color: semantic.textTertiary }]}>
            {hasActiveWithdrawal
              ? 'Une demande est déjà en cours de traitement.'
              : validatedNumbers.length === 0
                ? 'Ajoutez d’abord un numéro Mobile Money et attendez sa validation.'
                : `Minimum ${MIN_WITHDRAWAL.toLocaleString('fr-FR')} FCFA, sans frais.`}
          </Text>
        </View>

        {/* Payout numbers */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>MES NUMÉROS DE REVERSEMENT</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setIsAddingNumber(true)} activeOpacity={0.7}>
            <Plus size={16} color={colors.green[600]} strokeWidth={2.5} />
            <Text style={styles.addButtonText}>Ajouter</Text>
          </TouchableOpacity>
        </View>
        {numbers.length === 0
          ? (
              <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                  Aucun numéro. Ajoutez votre numéro Mobile Money pour recevoir vos reversements.
                </Text>
              </View>
            )
          : numbers.map(number => (
              <View key={number.id} style={[styles.numberCard, { backgroundColor: semantic.bgCard }]}>
                <View style={[styles.numberIcon, { backgroundColor: colors.green[50] }]}>
                  <Phone size={16} color={colors.green[600]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.numberPhone, { color: semantic.textPrimary }]}>{number.phoneNumber}</Text>
                  <Text style={[styles.numberMeta, { color: semantic.textTertiary }]}>
                    {number.operatorLabel}
                    {' · '}
                    {number.holderName}
                  </Text>
                  {number.rejectionReason && (
                    <Text style={[styles.numberMeta, { color: colors.coral[600] }]}>{number.rejectionReason}</Text>
                  )}
                </View>
                <Text style={[
                  styles.numberStatus,
                  {
                    color: number.status === 'VALIDATED'
                      ? colors.green[600]
                      : number.status === 'REJECTED' ? colors.coral[600] : colors.earth[600],
                  },
                ]}
                >
                  {NUMBER_STATUS_LABELS[number.status]}
                </Text>
                <TouchableOpacity onPress={() => deleteNumber(number.id)} hitSlop={8}>
                  <Trash2 size={16} color={colors.coral[400]} />
                </TouchableOpacity>
              </View>
            ))}

        {/* Withdrawals */}
        {withdrawals.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: semantic.textTertiary }]}>
              MES DEMANDES
            </Text>
            {withdrawals.map(withdrawal => (
              <View key={withdrawal.id} style={[styles.numberCard, { backgroundColor: semantic.bgCard }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.numberPhone, { color: semantic.textPrimary }]}>
                    {formatAmount(withdrawal.amount)}
                  </Text>
                  <Text style={[styles.numberMeta, { color: semantic.textTertiary }]}>
                    {new Date(withdrawal.createdAt).toLocaleDateString('fr-FR')}
                    {' · '}
                    {withdrawal.phoneNumber}
                  </Text>
                  {withdrawal.rejectionReason && (
                    <Text style={[styles.numberMeta, { color: colors.coral[600] }]}>{withdrawal.rejectionReason}</Text>
                  )}
                </View>
                <Text style={[styles.numberStatus, { color: WITHDRAWAL_STATUS_COLORS[withdrawal.status] }]}>
                  {WITHDRAWAL_STATUS_LABELS[withdrawal.status]}
                </Text>
                {withdrawal.status === 'PENDING' && (
                  <TouchableOpacity onPress={() => cancelWithdrawal(withdrawal.id)} hitSlop={8}>
                    <Text style={[styles.cancelLink, { color: colors.coral[600] }]}>Annuler</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}

        {/* Ledger */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: semantic.textTertiary }]}>
          HISTORIQUE
        </Text>
        {(wallet?.transactions.items.length ?? 0) === 0
          ? (
              <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                  Aucun mouvement pour le moment. Vos ventes livrées apparaîtront ici.
                </Text>
              </View>
            )
          : (
              <View style={[styles.ledgerCard, { backgroundColor: semantic.bgCard }]}>
                {wallet?.transactions.items.map((movement, index) => (
                  <View
                    key={movement.id}
                    style={[
                      styles.ledgerRow,
                      index > 0 && { borderTopWidth: 1, borderTopColor: semantic.borderLight },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ledgerLabel, { color: semantic.textPrimary }]} numberOfLines={1}>
                        {movement.description}
                      </Text>
                      <Text style={[styles.ledgerDate, { color: semantic.textTertiary }]}>
                        {new Date(movement.createdAt).toLocaleDateString('fr-FR')}
                      </Text>
                    </View>
                    <Text style={[
                      styles.ledgerAmount,
                      { color: movement.amount > 0 ? colors.green[600] : semantic.textPrimary },
                    ]}
                    >
                      {movement.amount > 0 ? '+' : ''}
                      {movement.amount.toLocaleString('fr-FR')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
      </ScrollView>

      {/* Add number modal */}
      <Modal visible={isAddingNumber} transparent animationType="slide" onRequestClose={() => setIsAddingNumber(false)}>
        <KeyboardAwareView style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: semantic.bgCard }]}>
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
            />
            <Text style={[styles.inputLabel, { color: semantic.textSecondary }]}>Nom du titulaire</Text>
            <TextInput
              style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
              placeholder="Tel qu'enregistré chez l'opérateur"
              placeholderTextColor={semantic.textTertiary}
              value={holderName}
              onChangeText={setHolderName}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setIsAddingNumber(false)}>
                <Text style={[styles.modalCancelText, { color: semantic.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (isSubmitting || phoneNumber.trim().length < 8 || holderName.trim().length < 2) && styles.buttonDisabled]}
                disabled={isSubmitting || phoneNumber.trim().length < 8 || holderName.trim().length < 2}
                onPress={submitNumber}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                  : <Text style={styles.modalConfirmText}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareView>
      </Modal>

      {/* Withdraw modal */}
      <Modal visible={isWithdrawing} transparent animationType="slide" onRequestClose={() => setIsWithdrawing(false)}>
        <KeyboardAwareView style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: semantic.bgCard }]}>
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
                    borderColor: withdrawNumberId === number.id ? colors.green[400] : semantic.borderNormal,
                  },
                ]}
                onPress={() => setWithdrawNumberId(number.id)}
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
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setIsWithdrawing(false)}>
                <Text style={[styles.modalCancelText, { color: semantic.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (isSubmitting || !isWithdrawValid) && styles.buttonDisabled]}
                disabled={isSubmitting || !isWithdrawValid}
                onPress={submitWithdrawal}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                  : <Text style={styles.modalConfirmText}>Confirmer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: spacing[8] },

  balanceCard: {
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    padding: spacing[5],
    borderRadius: radius.lg,
    gap: spacing[2],
  },
  balanceLabel: { ...typography.bodyS },
  balanceValue: { ...typography.display, fontFamily: fonts.sansBd, fontSize: 30, lineHeight: 36 },
  balanceHint: { ...typography.caption },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    marginTop: spacing[2],
  },
  withdrawButtonText: { ...typography.h3, color: colors.neutral[0] },
  buttonDisabled: { opacity: 0.5 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    marginTop: spacing[6],
    marginBottom: spacing[2],
  },
  sectionTitle: { ...typography.overline },
  sectionSpacing: { paddingHorizontal: spacing[4], marginTop: spacing[6], marginBottom: spacing[2] },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  addButtonText: { ...typography.bodyS, fontFamily: fonts.sansSb, color: colors.green[600] },

  emptyCard: {
    marginHorizontal: spacing[4],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  emptyText: { ...typography.bodyS, textAlign: 'center' },

  numberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  numberIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberPhone: { ...typography.bodyL, fontFamily: fonts.sansSb },
  numberMeta: { ...typography.caption },
  numberStatus: { ...typography.caption, fontFamily: fonts.sansSb },
  cancelLink: { ...typography.bodyS, fontFamily: fonts.sansSb },

  ledgerCard: {
    marginHorizontal: spacing[4],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  ledgerLabel: { ...typography.bodyS },
  ledgerDate: { ...typography.caption },
  ledgerAmount: { ...typography.bodyL, fontFamily: fonts.sansSb },

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
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[1],
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  modalCancel: { paddingVertical: spacing[3], paddingHorizontal: spacing[4] },
  modalCancelText: { ...typography.h3 },
  modalConfirm: {
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
    minWidth: 120,
    alignItems: 'center',
  },
  modalConfirmText: { ...typography.h3, color: colors.neutral[0] },
})
