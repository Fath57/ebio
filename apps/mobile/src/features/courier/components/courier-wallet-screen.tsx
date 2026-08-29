import type { CourierPayoutNumber, CourierTopup, CourierWalletTransactionType, CourierWithdrawal } from '../hooks/use-courier-wallet'
import ArrowDownToLine from 'lucide-react-native/dist/esm/icons/arrow-down-to-line'
import ArrowUpFromLine from 'lucide-react-native/dist/esm/icons/arrow-up-from-line'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import Percent from 'lucide-react-native/dist/esm/icons/percent'
import Phone from 'lucide-react-native/dist/esm/icons/phone'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import RotateCcw from 'lucide-react-native/dist/esm/icons/rotate-ccw'
import SlidersHorizontal from 'lucide-react-native/dist/esm/icons/sliders-horizontal'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { buildTopupCheckoutHtml, parseTopupCheckoutMessage } from '../../wallet/utils/topup-checkout'
import { useCourierWallet } from '../hooks/use-courier-wallet'
import { AddNumberSheet, MIN_WITHDRAWAL, TopupSheet, WithdrawSheet } from './courier-wallet-sheets'

const NUMBER_STATUS_LABELS: Record<CourierPayoutNumber['status'], string> = {
  PENDING: 'En vérification',
  VALIDATED: 'Validé',
  REJECTED: 'Refusé',
}

const NUMBER_STATUS_COLORS: Record<CourierPayoutNumber['status'], string> = {
  PENDING: colors.earth[600],
  VALIDATED: colors.green[600],
  REJECTED: colors.coral[600],
}

const WITHDRAWAL_STATUS_LABELS: Record<CourierWithdrawal['status'], string> = {
  PENDING: 'En attente',
  PROCESSING: 'Versement en cours',
  PAID: 'Versé',
  FAILED: 'Échoué',
  REJECTED: 'Refusé',
  CANCELLED: 'Annulé',
}

const WITHDRAWAL_STATUS_COLORS: Record<CourierWithdrawal['status'], string> = {
  PENDING: colors.earth[600],
  PROCESSING: colors.blue[600],
  PAID: colors.green[600],
  FAILED: colors.coral[600],
  REJECTED: colors.coral[600],
  CANCELLED: colors.neutral[400],
}

const TOPUP_STATUS_LABELS: Record<CourierTopup['status'], string> = {
  PENDING: 'En attente',
  COMPLETED: 'Créditée',
  FAILED: 'Échouée',
}

const TOPUP_STATUS_COLORS: Record<CourierTopup['status'], string> = {
  PENDING: colors.earth[600],
  COMPLETED: colors.green[600],
  FAILED: colors.coral[600],
}

type LucideIcon = typeof Bike

interface MovementStyle {
  label: string
  Icon: LucideIcon
  color: string
  background: string
}

/** Icon, colour and French label per ledger movement type. */
const MOVEMENT_STYLES: Record<CourierWalletTransactionType, MovementStyle> = {
  DELIVERY_EARNING: { label: 'Gain de course', Icon: Bike, color: colors.green[600], background: colors.green[50] },
  DELIVERY_COMMISSION: { label: 'Commission eBio', Icon: Percent, color: colors.coral[600], background: colors.coral[50] },
  TOPUP: { label: 'Recharge', Icon: ArrowDownToLine, color: colors.blue[600], background: colors.blue[50] },
  WITHDRAWAL: { label: 'Reversement', Icon: ArrowUpFromLine, color: colors.earth[600], background: colors.earth[50] },
  WITHDRAWAL_REFUND: { label: 'Reversement annulé', Icon: RotateCcw, color: colors.green[600], background: colors.green[50] },
  REFUND: { label: 'Remboursement', Icon: RotateCcw, color: colors.green[600], background: colors.green[50] },
  ADJUSTMENT: { label: 'Ajustement eBio', Icon: SlidersHorizontal, color: colors.neutral[600], background: colors.neutral[100] },
  ORDER_PAYMENT: { label: 'Paiement de commande', Icon: ArrowUpFromLine, color: colors.neutral[600], background: colors.neutral[100] },
  SALE_CREDIT: { label: 'Vente', Icon: ArrowDownToLine, color: colors.green[600], background: colors.green[50] },
  COMMISSION_DEBIT: { label: 'Commission eBio', Icon: Percent, color: colors.coral[600], background: colors.coral[50] },
  PROMO_COMPENSATION: { label: 'Compensation promo', Icon: ArrowDownToLine, color: colors.green[600], background: colors.green[50] },
}

const FALLBACK_MOVEMENT: MovementStyle = {
  label: 'Mouvement',
  Icon: SlidersHorizontal,
  color: colors.neutral[600],
  background: colors.neutral[100],
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Courier wallet: earnings ledger, top-up (to settle cash commissions) and
 * withdrawal to a validated Mobile Money number.
 */
export function CourierWalletScreen() {
  const { semantic } = useTheme()
  const { data: session } = useSession()
  const fedapayPublicKey = process.env.EXPO_PUBLIC_FEDAPAY_PUBLIC_KEY ?? null
  const {
    wallet,
    numbers,
    withdrawals,
    topups,
    isLoading,
    isRefreshing,
    refresh,
    reload,
    addPayoutNumber,
    deletePayoutNumber,
    requestWithdrawal,
    cancelWithdrawal,
    startTopup,
    verifyTopup,
  } = useCourierWallet()

  const [isAddingNumber, setIsAddingNumber] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [isToppingUp, setIsToppingUp] = useState(false)
  // FedaPay Checkout.js page rendered in a WebView; `pendingTopupId` is the
  // server-side top-up the page is paying for.
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null)
  const [pendingTopupId, setPendingTopupId] = useState<string | null>(null)

  const balance = wallet?.balance ?? 0
  const debt = balance < 0 ? -balance : 0
  const validatedNumbers = numbers.filter(number => number.status === 'VALIDATED')
  const hasActiveWithdrawal = withdrawals.some(w => w.status === 'PENDING' || w.status === 'PROCESSING')
  const canWithdraw = balance >= MIN_WITHDRAWAL && validatedNumbers.length > 0 && !hasActiveWithdrawal
  const movements = wallet?.transactions.items ?? []

  const handleAddNumber = useCallback(async (phoneNumber: string, holderName: string) => {
    const result = await addPayoutNumber(phoneNumber, holderName)
    if (!result.ok) {
      appAlert('Numéro refusé', result.message)
      return false
    }
    setIsAddingNumber(false)
    appAlert('Numéro enregistré', 'eBio va vérifier que ce numéro vous appartient. Vous serez notifié une fois validé.')
    return true
  }, [addPayoutNumber])

  const handleDeleteNumber = useCallback((number: CourierPayoutNumber) => {
    appAlert('Supprimer ce numéro ?', number.phoneNumber, [
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const result = await deletePayoutNumber(number.id)
          if (!result.ok) {
            appAlert('Suppression impossible', result.message)
          }
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ])
  }, [deletePayoutNumber])

  const handleWithdraw = useCallback(async (payoutNumberId: string, amount: number) => {
    const result = await requestWithdrawal(payoutNumberId, amount)
    if (!result.ok) {
      appAlert('Demande refusée', result.message)
      return false
    }
    setIsWithdrawing(false)
    appAlert('Demande envoyée', 'Le montant est réservé. Vous recevrez le versement sur votre Mobile Money après validation par eBio.')
    return true
  }, [requestWithdrawal])

  const handleCancelWithdrawal = useCallback((withdrawal: CourierWithdrawal) => {
    appAlert('Annuler cette demande ?', `${formatAmount(withdrawal.amount)} seront remis sur votre solde.`, [
      {
        text: 'Annuler la demande',
        style: 'destructive',
        onPress: async () => {
          const result = await cancelWithdrawal(withdrawal.id)
          if (!result.ok) {
            appAlert('Annulation impossible', result.message)
          }
        },
      },
      { text: 'Garder', style: 'cancel' },
    ])
  }, [cancelWithdrawal])

  const handleTopup = useCallback(async (amount: number) => {
    const result = await startTopup(amount)
    if (!result.ok) {
      appAlert('Recharge impossible', result.message)
      return false
    }
    setIsToppingUp(false)
    setPendingTopupId(result.topupId)
    setCheckoutHtml(buildTopupCheckoutHtml(
      fedapayPublicKey ?? '',
      result.amount,
      result.topupId,
      session?.user?.name ?? 'Livreur eBio',
      session?.user?.email ?? null,
    ))
    return true
  }, [startTopup, fedapayPublicKey, session])

  // Leaving the payment page: the webhook has (or will shortly have) credited
  // the wallet — reload either way.
  const closeCheckout = useCallback(() => {
    setCheckoutHtml(null)
    setPendingTopupId(null)
    reload()
  }, [reload])

  const handleCheckoutMessage = useCallback(async (event: { nativeEvent: { data: string } }) => {
    const message = parseTopupCheckoutMessage(event.nativeEvent.data)
    if (!message) {
      closeCheckout()
      return
    }
    if (message.type === 'completed' && pendingTopupId) {
      const result = await verifyTopup(pendingTopupId, message.transactionId)
      if (result.ok) {
        appAlert('Recharge confirmée', 'Votre portefeuille a été crédité.')
      }
      else {
        appAlert('Vérification échouée', result.message === 'Une erreur est survenue'
          ? 'La recharge sera vérifiée automatiquement.'
          : result.message)
      }
    }
    else if (message.type === 'failed') {
      appAlert('Paiement échoué', message.reason ?? 'Le paiement a échoué.')
    }
    closeCheckout()
  }, [pendingTopupId, verifyTopup, closeCheckout])

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  if (checkoutHtml) {
    return (
      <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Recharge du portefeuille" onBack={closeCheckout} />
        <WebView
          source={{ html: checkoutHtml }}
          style={{ flex: 1 }}
          onMessage={handleCheckoutMessage}
          javaScriptEnabled
        />
      </View>
    )
  }

  const withdrawHint = hasActiveWithdrawal
    ? 'Une demande est déjà en cours de traitement.'
    : validatedNumbers.length === 0
      ? 'Ajoutez d’abord un numéro Mobile Money et attendez sa validation.'
      : balance < MIN_WITHDRAWAL
        ? `Reversement possible à partir de ${MIN_WITHDRAWAL.toLocaleString('fr-FR')} FCFA de solde.`
        : `Minimum ${MIN_WITHDRAWAL.toLocaleString('fr-FR')} FCFA, sans frais.`

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Portefeuille" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.green[400]} />}
      >
        {/* Balance */}
        <View style={[styles.balanceCard, { backgroundColor: semantic.bgCard }]}>
          <Text style={[styles.balanceLabel, { color: semantic.textSecondary }]}>Solde disponible</Text>
          <Text style={[styles.balanceValue, { color: balance < 0 ? colors.coral[600] : semantic.textPrimary }]}>
            {formatAmount(balance)}
          </Text>
          {balance < 0
            ? (
                <View style={[styles.negativeBanner, { backgroundColor: colors.coral[50] }]}>
                  <TriangleAlert size={18} color={colors.coral[600]} strokeWidth={2} />
                  <Text style={[styles.negativeText, { color: colors.coral[800] }]}>
                    Solde négatif : rechargez votre portefeuille pour régler la commission eBio des courses payées en espèces.
                  </Text>
                </View>
              )
            : null}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, !fedapayPublicKey && styles.buttonDisabled]}
              disabled={!fedapayPublicKey}
              onPress={() => setIsToppingUp(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Recharger le portefeuille"
            >
              <Plus size={16} color={colors.neutral[0]} strokeWidth={2.5} />
              <Text style={styles.primaryButtonText}>Recharger</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.green[400] }, !canWithdraw && styles.buttonDisabled]}
              disabled={!canWithdraw}
              onPress={() => setIsWithdrawing(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Demander un reversement"
            >
              <ArrowUpFromLine size={16} color={colors.green[600]} strokeWidth={2} />
              <Text style={[styles.secondaryButtonText, { color: colors.green[600] }]}>Reversement</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.balanceHint, { color: semantic.textTertiary }]}>{withdrawHint}</Text>
        </View>

        {/* Payout numbers */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>MES NUMÉROS DE REVERSEMENT</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setIsAddingNumber(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un numéro Mobile Money"
          >
            <Plus size={16} color={colors.green[600]} strokeWidth={2.5} />
            <Text style={styles.addButtonText}>Ajouter</Text>
          </TouchableOpacity>
        </View>
        {numbers.length === 0
          ? (
              <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                  Aucun numéro. Ajoutez votre numéro Mobile Money pour recevoir vos gains.
                </Text>
              </View>
            )
          : numbers.map(number => (
              <View key={number.id} style={[styles.rowCard, { backgroundColor: semantic.bgCard }]}>
                <View style={[styles.rowIcon, { backgroundColor: colors.green[50] }]}>
                  <Phone size={16} color={colors.green[600]} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: semantic.textPrimary }]}>{number.phoneNumber}</Text>
                  <Text style={[styles.rowMeta, { color: semantic.textTertiary }]}>
                    {number.operatorLabel}
                    {' · '}
                    {number.holderName}
                  </Text>
                  {number.rejectionReason
                    ? <Text style={[styles.rowMeta, { color: colors.coral[600] }]}>{number.rejectionReason}</Text>
                    : null}
                </View>
                <Text style={[styles.rowStatus, { color: NUMBER_STATUS_COLORS[number.status] }]}>
                  {NUMBER_STATUS_LABELS[number.status]}
                </Text>
                <TouchableOpacity
                  style={styles.rowAction}
                  onPress={() => handleDeleteNumber(number)}
                  accessibilityRole="button"
                  accessibilityLabel={`Supprimer le numéro ${number.phoneNumber}`}
                >
                  <Trash2 size={16} color={colors.coral[400]} />
                </TouchableOpacity>
              </View>
            ))}

        {/* Withdrawals */}
        {withdrawals.length > 0
          ? (
              <>
                <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: semantic.textTertiary }]}>
                  MES REVERSEMENTS
                </Text>
                {withdrawals.map(withdrawal => (
                  <View key={withdrawal.id} style={[styles.rowCard, { backgroundColor: semantic.bgCard }]}>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: semantic.textPrimary }]}>
                        {formatAmount(withdrawal.amount)}
                      </Text>
                      <Text style={[styles.rowMeta, { color: semantic.textTertiary }]}>
                        {formatDate(withdrawal.createdAt)}
                        {' · '}
                        {withdrawal.phoneNumber}
                      </Text>
                      {withdrawal.rejectionReason
                        ? <Text style={[styles.rowMeta, { color: colors.coral[600] }]}>{withdrawal.rejectionReason}</Text>
                        : null}
                    </View>
                    <Text style={[styles.rowStatus, { color: WITHDRAWAL_STATUS_COLORS[withdrawal.status] }]}>
                      {WITHDRAWAL_STATUS_LABELS[withdrawal.status]}
                    </Text>
                    {withdrawal.status === 'PENDING'
                      ? (
                          <TouchableOpacity
                            style={styles.rowAction}
                            onPress={() => handleCancelWithdrawal(withdrawal)}
                            accessibilityRole="button"
                            accessibilityLabel={`Annuler le reversement de ${formatAmount(withdrawal.amount)}`}
                          >
                            <Text style={[styles.cancelLink, { color: colors.coral[600] }]}>Annuler</Text>
                          </TouchableOpacity>
                        )
                      : null}
                  </View>
                ))}
              </>
            )
          : null}

        {/* Top-ups */}
        {topups.length > 0
          ? (
              <>
                <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: semantic.textTertiary }]}>
                  MES RECHARGES
                </Text>
                <View style={[styles.ledgerCard, { backgroundColor: semantic.bgCard }]}>
                  {topups.map((topup, index) => (
                    <View
                      key={topup.id}
                      style={[
                        styles.ledgerRow,
                        index > 0 && { borderTopWidth: 1, borderTopColor: semantic.borderLight },
                      ]}
                    >
                      <View style={styles.rowBody}>
                        <Text style={[styles.ledgerLabel, { color: semantic.textPrimary }]}>
                          {formatAmount(topup.amount)}
                        </Text>
                        <Text style={[styles.ledgerDate, { color: semantic.textTertiary }]}>
                          {new Date(topup.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </Text>
                      </View>
                      <Text style={[styles.rowStatus, { color: TOPUP_STATUS_COLORS[topup.status] }]}>
                        {TOPUP_STATUS_LABELS[topup.status]}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )
          : null}

        {/* Ledger */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: semantic.textTertiary }]}>
          MOUVEMENTS
        </Text>
        {movements.length === 0
          ? (
              <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                  Aucun mouvement pour le moment. Vos gains de course apparaîtront ici.
                </Text>
              </View>
            )
          : (
              <View style={[styles.ledgerCard, { backgroundColor: semantic.bgCard }]}>
                {movements.map((movement, index) => {
                  const style = MOVEMENT_STYLES[movement.type] ?? FALLBACK_MOVEMENT
                  const MovementIcon = style.Icon
                  return (
                    <View
                      key={movement.id}
                      style={[
                        styles.ledgerRow,
                        index > 0 && { borderTopWidth: 1, borderTopColor: semantic.borderLight },
                      ]}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: style.background }]}>
                        <MovementIcon size={16} color={style.color} strokeWidth={2} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={[styles.ledgerLabel, { color: semantic.textPrimary }]} numberOfLines={1}>
                          {movement.description || style.label}
                        </Text>
                        <Text style={[styles.ledgerDate, { color: semantic.textTertiary }]}>
                          {style.label}
                          {' · '}
                          {formatDate(movement.createdAt)}
                        </Text>
                      </View>
                      <Text style={[
                        styles.ledgerAmount,
                        { color: movement.amount > 0 ? colors.green[600] : movement.amount < 0 ? colors.coral[600] : semantic.textPrimary },
                      ]}
                      >
                        {movement.amount > 0 ? '+' : ''}
                        {movement.amount.toLocaleString('fr-FR')}
                      </Text>
                    </View>
                  )
                })}
              </View>
            )}
      </ScrollView>

      <AddNumberSheet
        visible={isAddingNumber}
        onClose={() => setIsAddingNumber(false)}
        onSubmit={handleAddNumber}
      />
      <WithdrawSheet
        visible={isWithdrawing}
        onClose={() => setIsWithdrawing(false)}
        balance={balance}
        validatedNumbers={validatedNumbers}
        onSubmit={handleWithdraw}
      />
      <TopupSheet
        visible={isToppingUp}
        onClose={() => setIsToppingUp(false)}
        debt={debt}
        onSubmit={handleTopup}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: spacing[12] },

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
  negativeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    borderRadius: radius.md,
    padding: spacing[3],
  },
  negativeText: { ...typography.bodyS, flex: 1 },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
  },
  primaryButtonText: { ...typography.h3, fontSize: 15, color: colors.neutral[0] },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[3],
  },
  secondaryButtonText: { ...typography.h3, fontSize: 15 },
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
  addButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  addButtonText: { ...typography.bodyS, fontFamily: fonts.sansSb, color: colors.green[600] },

  emptyCard: {
    marginHorizontal: spacing[4],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  emptyText: { ...typography.bodyS, textAlign: 'center' },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.bodyL, fontFamily: fonts.sansSb },
  rowMeta: { ...typography.caption },
  rowStatus: { ...typography.caption, fontFamily: fonts.sansSb },
  rowAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
})
