import Plus from 'lucide-react-native/dist/esm/icons/plus'
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
import { WebView } from 'react-native-webview'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { buildTopupCheckoutHtml, TOPUP_PRESETS } from '../utils/topup-checkout'

interface WalletData {
  id: string
  balance: number
  transactions: {
    items: Array<{
      id: string
      type: string
      amount: number
      description: string
      createdAt: string
    }>
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

interface WalletScreenProps {
  onGoBack: () => void
}

export function WalletScreen({ onGoBack }: WalletScreenProps) {
  const { semantic } = useTheme()
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [topups, setTopups] = useState<Topup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isToppingUp, setIsToppingUp] = useState(false)
  const [topupAmount, setTopupAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { data: session } = useSession()
  const fedapayPublicKey = process.env.EXPO_PUBLIC_FEDAPAY_PUBLIC_KEY ?? null
  // Checkout.js widget HTML, same mechanism as the order payment: local page,
  // native postMessage on completion, server-side re-check before crediting.
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null)
  const [pendingTopupId, setPendingTopupId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [walletRes, topupsRes] = await Promise.all([
        apiFetch('/api/wallet/me'),
        apiFetch('/api/wallet/me/topups'),
      ])
      if (walletRes.ok) {
        setWallet(await walletRes.json())
      }
      if (topupsRes.ok) {
        const data = await topupsRes.json() as { items: Topup[] }
        setTopups(data.items)
      }
    }
    catch {
      // pull-to-refresh retries
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
      const data = await res.json() as { topupId: string, amount: number }
      setIsToppingUp(false)
      setTopupAmount('')
      setPendingTopupId(data.topupId)
      setCheckoutHtml(buildTopupCheckoutHtml(
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
    setPendingTopupId(null)
    setIsLoading(true)
    load()
  }, [load])

  const handleCheckoutMessage = useCallback(async (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type: string, transactionId?: string, reason?: string }
      if (data.type === 'completed' && pendingTopupId && data.transactionId) {
        // The server re-checks the transaction with FedaPay (status AND
        // amount) before crediting — the widget's word alone is worthless.
        const res = await apiFetch(`/api/wallet/me/topups/${pendingTopupId}/verify`, {
          method: 'POST',
          body: JSON.stringify({ fedapayTransactionId: data.transactionId }),
        })
        if (res.ok) {
          appAlert('Recharge confirmée', 'Votre portefeuille a été crédité.')
        }
        else {
          const body = await res.json().catch(() => null) as { message?: string } | null
          appAlert('Vérification échouée', body?.message ?? 'La recharge sera vérifiée automatiquement.')
        }
        closeCheckout()
      }
      else if (data.type === 'failed') {
        appAlert('Paiement échoué', data.reason ?? 'Le paiement a échoué.')
        closeCheckout()
      }
      else if (data.type === 'closed') {
        closeCheckout()
      }
    }
    catch {
      closeCheckout()
    }
  }, [pendingTopupId, closeCheckout])

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  // FedaPay payment page: once the user leaves it, the webhook has (or will
  // shortly have) credited the wallet — reload on close.
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

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Mon portefeuille" onBack={onGoBack} />
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
        <View style={[styles.balanceCard, { backgroundColor: semantic.bgCard }]}>
          <Text style={[styles.balanceLabel, { color: semantic.textSecondary }]}>Solde disponible</Text>
          <Text style={[styles.balanceValue, { color: semantic.textPrimary }]}>
            {formatAmount(wallet?.balance ?? 0)}
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
        {(wallet?.transactions.items.length ?? 0) === 0
          ? (
              <View style={[styles.emptyCard, { backgroundColor: semantic.bgCard }]}>
                <Text style={[styles.emptyText, { color: semantic.textSecondary }]}>
                  Aucun mouvement. Rechargez votre portefeuille pour commencer.
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

      {/* Topup modal */}
      <Modal visible={isToppingUp} transparent animationType="slide" onRequestClose={() => setIsToppingUp(false)}>
        <KeyboardAwareView style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.modalTitle, { color: semantic.textPrimary }]}>Recharger mon portefeuille</Text>
            <Text style={[styles.modalHint, { color: semantic.textSecondary }]}>
              Le paiement passe par FedaPay (Mobile Money ou carte). Le solde est crédité dès la confirmation.
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
