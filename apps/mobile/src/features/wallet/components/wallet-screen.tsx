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
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'

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

const TOPUP_PRESETS = [1000, 2000, 5000, 10000]

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

interface WalletScreenProps {
  onGoBack: () => void
}

export function WalletScreen({ onGoBack }: WalletScreenProps) {
  const { semantic } = useTheme()
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isToppingUp, setIsToppingUp] = useState(false)
  const [topupAmount, setTopupAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // FedaPay checkout page for the topup; closing it refreshes the balance.
  const [topupUrl, setTopupUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/wallet/me')
      if (res.ok) {
        setWallet(await res.json())
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
      const data = await res.json() as { redirectUrl: string }
      setIsToppingUp(false)
      setTopupAmount('')
      setTopupUrl(data.redirectUrl)
    }
    finally {
      setIsSubmitting(false)
    }
  }, [topupAmount])

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  // FedaPay payment page: once the user leaves it, the webhook has (or will
  // shortly have) credited the wallet — reload on close.
  if (topupUrl) {
    return (
      <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader
          title="Recharge du portefeuille"
          onBack={() => {
            setTopupUrl(null)
            setIsLoading(true)
            load()
          }}
        />
        <WebView source={{ uri: topupUrl }} style={{ flex: 1 }} />
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
            style={styles.topupButton}
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
        <View style={styles.modalOverlay}>
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
        </View>
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
