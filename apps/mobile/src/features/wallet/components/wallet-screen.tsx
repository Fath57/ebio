import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
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
import { ListFooterLoader } from '../../common/components/list-footer-loader'
import { ScreenHeader } from '../../common/components/screen-header'
import { hasMoreAfter, PAGE_SIZE, usePaginatedList } from '../../common/hooks/use-paginated-list'
import { PaymentWebView } from '../../payments/components/payment-web-view'
import { buildTopupCheckoutHtml, TOPUP_PRESETS } from '../utils/topup-checkout'

interface Movement {
  id: string
  type: string
  amount: number
  description: string
  createdAt: string
}

interface WalletData {
  id: string
  balance: number
  transactions: {
    items: Movement[]
    total: number
  }
}

interface Topup {
  id: string
  amount: number
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  createdAt: string
}

const TOPUP_STATUS_LABELS: Record<Topup['status'], string> = {
  PENDING: 'En attente',
  COMPLETED: 'Créditée',
  FAILED: 'Échouée',
}

const TOPUP_STATUS_COLORS: Record<Topup['status'], string> = {
  PENDING: colors.earth[600],
  COMPLETED: colors.green[600],
  FAILED: colors.coral[600],
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

interface MovementRowProps {
  movement: Movement
  isFirst: boolean
  isLast: boolean
}

/**
 * One line of the ledger. The rows are list items now, so the card they sit
 * in is drawn by the rows themselves: rounded on the first and the last one.
 */
function MovementRow({ movement, isFirst, isLast }: MovementRowProps) {
  const { semantic } = useTheme()
  return (
    <View
      style={[
        styles.ledgerItem,
        { backgroundColor: semantic.bgCard },
        isFirst && styles.ledgerItemFirst,
        isLast && styles.ledgerItemLast,
      ]}
    >
      <View
        style={[
          styles.ledgerRow,
          !isFirst && { borderTopWidth: 1, borderTopColor: semantic.borderLight },
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
    </View>
  )
}

interface WalletScreenProps {
  onGoBack: () => void
}

export function WalletScreen({ onGoBack }: WalletScreenProps) {
  // The tab bar floats over the content: without its height the last
  // row sits underneath it.
  const tabBarHeight = useBottomTabBarHeight()
  const { semantic } = useTheme()
  const [balance, setBalance] = useState(0)
  const [topups, setTopups] = useState<Topup[]>([])
  const [isToppingUp, setIsToppingUp] = useState(false)
  const [topupAmount, setTopupAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { data: session } = useSession()
  const fedapayPublicKey = process.env.EXPO_PUBLIC_FEDAPAY_PUBLIC_KEY ?? null
  // Checkout.js widget HTML, same mechanism as the order payment: local page,
  // native postMessage on completion, server-side re-check before crediting.
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null)
  /** The provider's own page, when it hands one over. */
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  /** Reference held by the server, the only one we confirm with. */
  const [providerTransactionId, setProviderTransactionId] = useState<string | null>(null)
  const [pendingTopupId, setPendingTopupId] = useState<string | null>(null)

  // The ledger scrolls page by page; the first page also brings the balance
  // and the latest topups, so a refresh keeps the header in step with it.
  const {
    items: movements,
    isLoading,
    isRefreshing,
    isLoadingMore,
    refresh,
    loadMore,
  } = usePaginatedList<Movement>(async (page) => {
    const walletRes = await apiFetch(`/api/wallet/me?page=${page}&limit=${PAGE_SIZE}`)
    if (!walletRes.ok) {
      throw new Error('Portefeuille indisponible')
    }
    const data = await walletRes.json() as WalletData
    if (page === 1) {
      setBalance(data.balance)
      // The latest topups only: the ledger already records every credited one.
      const topupsRes = await apiFetch('/api/wallet/me/topups')
      if (topupsRes.ok) {
        const topupData = await topupsRes.json() as { items: Topup[] }
        setTopups(topupData.items)
      }
    }
    return {
      items: data.transactions.items,
      hasMore: hasMoreAfter(page, PAGE_SIZE, data.transactions.total),
    }
  })

  const startTopup = useCallback(async () => {
    const amount = Number(topupAmount)
    if (Number.isNaN(amount) || amount < 100) {
      appAlert('Montant invalide', 'Le minimum de recharge est de 100 FCFA.')
      return
    }
    setIsSubmitting(true)
    try {
      const res = await apiFetch('/api/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null
        appAlert('Erreur', body?.message ?? 'Impossible de démarrer la recharge.')
        return
      }
      const data = await res.json() as {
        topupId: string
        amount: number
        paymentUrl?: string | null
        providerTransactionId?: string | null
      }
      setIsToppingUp(false)
      setTopupAmount('')
      setPendingTopupId(data.topupId)
      setPaymentUrl(data.paymentUrl ?? null)
      setProviderTransactionId(data.providerTransactionId ?? null)
      // Only a widget-based provider leaves the page to us to build.
      setCheckoutHtml(data.paymentUrl
        ? null
        : buildTopupCheckoutHtml(
            fedapayPublicKey ?? '',
            data.amount,
            data.topupId,
            session?.user?.name ?? 'Client eBio',
            session?.user?.email ?? null,
          ))
    }
    finally {
      setIsSubmitting(false)
    }
  }, [topupAmount, fedapayPublicKey, session])

  const closeCheckout = useCallback(() => {
    setCheckoutHtml(null)
    setPaymentUrl(null)
    setProviderTransactionId(null)
    setPendingTopupId(null)
    refresh()
  }, [refresh])

  /**
   * Silent check, handed to the payment screen. Asking the verify endpoint
   * is enough: it re-reads the transaction from the provider and only
   * answers 200 once the money is really there.
   */
  const pollTopupStatus = useCallback(async (): Promise<'settled' | 'pending' | 'failed'> => {
    if (!pendingTopupId || !providerTransactionId) {
      return 'pending'
    }
    const res = await apiFetch(`/api/wallet/me/topups/${pendingTopupId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ fedapayTransactionId: providerTransactionId }),
    })
    if (res.ok) {
      return 'settled'
    }
    // A refusal says which of the two it is; without the code we would keep
    // waiting on a payment that has already failed.
    const body = await res.json().catch(() => null) as { code?: string } | null
    return body?.code === 'payment_failed' ? 'failed' : 'pending'
  }, [pendingTopupId, providerTransactionId])

  const confirmTopup = useCallback(async (reference: string) => {
    if (!pendingTopupId) {
      return
    }
    // The server re-checks status AND amount with the provider before
    // crediting — the page's word alone is worthless.
    const res = await apiFetch(`/api/wallet/me/topups/${pendingTopupId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ fedapayTransactionId: reference }),
    })
    if (res.ok) {
      appAlert('Recharge confirmée', 'Votre portefeuille a été crédité.')
    }
    else {
      const body = await res.json().catch(() => null) as { message?: string } | null
      appAlert('Vérification échouée', body?.message ?? 'La recharge sera vérifiée automatiquement.')
    }
    closeCheckout()
  }, [pendingTopupId, closeCheckout])

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  if (checkoutHtml || paymentUrl) {
    return (
      <PaymentWebView
        url={paymentUrl}
        html={checkoutHtml}
        transactionId={providerTransactionId}
        title="Recharge du portefeuille"
        onSettled={confirmTopup}
        onCancel={closeCheckout}
        pollStatus={pollTopupStatus}
      />
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Mon portefeuille" onBack={onGoBack} />
      <FlatList
        data={movements}
        keyExtractor={movement => movement.id}
        renderItem={({ item, index }) => (
          <MovementRow movement={item} isFirst={index === 0} isLast={index === movements.length - 1} />
        )}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={<ListFooterLoader isLoading={isLoadingMore} />}
        ListEmptyComponent={(
          <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
              Aucun mouvement. Rechargez votre portefeuille pour commencer.
            </Text>
          </View>
        )}
        ListHeaderComponent={(
          <>
            <View style={[styles.balanceCard, { backgroundColor: semantic.bgCard }]}>
              <Text style={[styles.balanceLabel, { color: semantic.textSecondary }]}>Solde disponible</Text>
              <Text style={[styles.balanceValue, { color: semantic.textPrimary }]}>
                {formatAmount(balance)}
              </Text>
              <TouchableOpacity
                style={[styles.topupButton, !fedapayPublicKey && styles.buttonDisabled]}
                disabled={!fedapayPublicKey}
                onPress={() => setIsToppingUp(true)}
                activeOpacity={0.8}
              >
                <Plus size={16} color={colors.neutral[0]} strokeWidth={2.5} />
                <Text style={styles.topupButtonText}>Recharger</Text>
              </TouchableOpacity>
              <Text style={[styles.balanceHint, { color: semantic.textTertiary }]}>
                Rechargez par Mobile Money et payez vos commandes en un geste, sans frais.
              </Text>
            </View>

            {topups.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>MES RECHARGES</Text>
                <View style={[styles.ledgerCard, { backgroundColor: semantic.bgCard }]}>
                  {topups.map((topup, index) => (
                    <View
                      key={topup.id}
                      style={[
                        styles.ledgerRow,
                        index > 0 && { borderTopWidth: 1, borderTopColor: semantic.borderLight },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ledgerLabel, { color: semantic.textPrimary }]}>
                          {formatAmount(topup.amount)}
                        </Text>
                        <Text style={[styles.ledgerDate, { color: semantic.textTertiary }]}>
                          {new Date(topup.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </Text>
                      </View>
                      <Text style={[styles.topupStatus, { color: TOPUP_STATUS_COLORS[topup.status] }]}>
                        {TOPUP_STATUS_LABELS[topup.status]}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>HISTORIQUE</Text>
          </>
        )}
      />

      {/* Topup modal */}
      <Modal visible={isToppingUp} transparent animationType="slide" onRequestClose={() => setIsToppingUp(false)}>
        <KeyboardAwareView style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.modalTitle, { color: semantic.textPrimary }]}>Recharger mon portefeuille</Text>
            <Text style={[styles.modalHint, { color: semantic.textSecondary }]}>
              Paiement par Mobile Money ou carte. Le solde est crédité dès la confirmation.
            </Text>
            <View style={styles.presetRow}>
              {TOPUP_PRESETS.map(preset => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: semantic.bgSurface,
                      borderColor: topupAmount === String(preset) ? colors.green[400] : semantic.borderNormal,
                    },
                  ]}
                  onPress={() => setTopupAmount(String(preset))}
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
              value={topupAmount}
              onChangeText={setTopupAmount}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setIsToppingUp(false)}>
                <Text style={[styles.modalCancelText, { color: semantic.textSecondary }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (isSubmitting || !topupAmount) && styles.buttonDisabled]}
                disabled={isSubmitting || !topupAmount}
                onPress={startTopup}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color={colors.neutral[0]} />
                  : <Text style={styles.modalConfirmText}>Continuer</Text>}
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
  content: {},

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
  topupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    paddingVertical: spacing[3],
    marginTop: spacing[2],
  },
  topupButtonText: { ...typography.h3, color: colors.neutral[0] },
  buttonDisabled: { opacity: 0.5 },

  sectionTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginTop: spacing[6],
    marginBottom: spacing[2],
  },
  emptyCard: {
    marginHorizontal: spacing[4],
    padding: spacing[4],
    borderRadius: radius.lg,
  },
  emptyText: { ...typography.bodyS, textAlign: 'center' },
  ledgerCard: {
    marginHorizontal: spacing[4],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[4],
  },
  ledgerItem: {
    marginHorizontal: spacing[4],
    paddingHorizontal: spacing[4],
  },
  ledgerItemFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  ledgerItemLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
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
  topupStatus: { ...typography.caption, fontFamily: fonts.sansSb },

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
  presetRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  presetChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
  },
  presetText: { ...typography.bodyS, fontFamily: fonts.sansSb },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    marginTop: spacing[2],
    ...typography.bodyL,
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
