import type { SettlementStatus } from '../../payments/utils/await-settlement'
import type { FamilyMember, FamilyMemberStatus, FamilyTopupStart, FamilyWallet } from '../family-wallet-api'
import { useFocusEffect } from '@react-navigation/native'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import CirclePause from 'lucide-react-native/dist/esm/icons/circle-pause'
import History from 'lucide-react-native/dist/esm/icons/history'
import Hourglass from 'lucide-react-native/dist/esm/icons/hourglass'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import SlidersHorizontal from 'lucide-react-native/dist/esm/icons/sliders-horizontal'
import UserPlus from 'lucide-react-native/dist/esm/icons/user-plus'
import UsersRound from 'lucide-react-native/dist/esm/icons/users-round'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { formatXof, useMoney } from '../../common/hooks/use-money'
import { PaymentWebView } from '../../payments/components/payment-web-view'
import { awaitSettlement } from '../../payments/utils/await-settlement'
import { fetchFamilyWallet, openFamilyWallet, verifyFamilyTopup } from '../family-wallet-api'
import { FamilyTopupSheet } from './family-topup-sheet'

interface FamilyWalletScreenProps {
  onBack: () => void
  onAddMember: () => void
  onOpenLimits: () => void
  onOpenHistory: () => void
}

const MEMBER_STATUS: Record<FamilyMemberStatus, { label: string, Icon: typeof CircleCheck, color: string }> = {
  ACTIVE: { label: 'Actif', Icon: CircleCheck, color: colors.green[600] },
  PENDING: { label: 'En attente d’inscription', Icon: Hourglass, color: colors.earth[600] },
  SUSPENDED: { label: 'Suspendu', Icon: CirclePause, color: colors.neutral[600] },
}

function announceFamilyTopup(status: SettlementStatus, afterWaiting: boolean): void {
  if (status === 'settled') {
    appAlert('Recharge confirmée', 'Le portefeuille famille a été crédité. Vos proches actifs sont prévenus.')
  }
  else if (status === 'failed') {
    appAlert('Paiement échoué', 'Le paiement n’a pas abouti. Aucun montant n’a été débité.')
  }
  else if (afterWaiting) {
    appAlert('Paiement en cours de confirmation', 'Le solde sera mis à jour dès que l’opérateur aura confirmé le paiement.')
  }
}

interface MemberRowProps {
  member: FamilyMember
  isFirst: boolean
}

/** One member: nickname, status (icon + word), spending of the month against the cap. */
function MemberRow({ member, isFirst }: MemberRowProps) {
  const { semantic } = useTheme()
  const status = MEMBER_STATUS[member.status]
  const cap = member.effective.monthlyCap
  const ratio = cap && cap > 0 ? Math.min(1, member.spentThisMonth / cap) : 0
  const spentText = cap
    ? `${formatXof(member.spentThisMonth)} dépensés sur ${formatXof(cap)} ce mois-ci`
    : `${formatXof(member.spentThisMonth)} dépensés ce mois-ci · sans plafond`

  return (
    <View style={[styles.memberRow, !isFirst && { borderTopWidth: 1, borderTopColor: semantic.borderLight }]}>
      <View style={styles.memberHead}>
        <Text style={[styles.memberName, { color: semantic.textPrimary }]} numberOfLines={1}>
          {member.nickname}
        </Text>
        <View style={styles.memberStatus}>
          <status.Icon size={14} color={status.color} strokeWidth={2.2} />
          <Text style={[styles.memberStatusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      {cap !== null && (
        <View
          style={[styles.gaugeTrack, { backgroundColor: semantic.borderLight }]}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Dépense du mois de ${member.nickname}`}
          accessibilityValue={{ min: 0, max: cap, now: Math.min(member.spentThisMonth, cap) }}
        >
          <View
            style={[
              styles.gaugeFill,
              { width: `${Math.round(ratio * 100)}%`, backgroundColor: ratio >= 1 ? colors.earth[400] : colors.green[400] },
            ]}
          />
        </View>
      )}
      <Text style={[styles.memberSpent, { color: semantic.textSecondary }]}>{spentText}</Text>
    </View>
  )
}

interface ActionButtonProps {
  label: string
  Icon: typeof Plus
  onPress: () => void
  primary?: boolean
  disabled?: boolean
}

function ActionButton({ label, Icon, onPress, primary = false, disabled = false }: ActionButtonProps) {
  const { semantic } = useTheme()
  const color = primary ? colors.neutral[0] : colors.green[600]
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        primary
          ? { backgroundColor: colors.green[400], borderColor: colors.green[400] }
          : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Icon size={16} color={color} strokeWidth={2.2} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  )
}

/** The payer's family wallet: open it, see balance and members, recharge. */
export function FamilyWalletScreen({ onBack, onAddMember, onOpenLimits, onOpenHistory }: FamilyWalletScreenProps) {
  const { semantic } = useTheme()
  const { formatMoney, currency } = useMoney()
  const [wallet, setWallet] = useState<FamilyWallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [topupOpen, setTopupOpen] = useState(false)
  const [checkout, setCheckout] = useState<FamilyTopupStart | null>(null)
  const [confirming, setConfirming] = useState(false)
  // What the payment page's own polling last saw, so a failure is not announced twice.
  const lastPolledRef = useRef<SettlementStatus>('pending')

  const load = useCallback(async (): Promise<void> => {
    try {
      setWallet(await fetchFamilyWallet())
      setLoadError(null)
    }
    catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Impossible de charger votre portefeuille famille.')
    }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Members added or limits changed on another screen: read again on focus.
  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  const handleOpen = useCallback(async () => {
    setOpening(true)
    const result = await openFamilyWallet()
    setOpening(false)
    if (result.error !== null) {
      appAlert('Ouverture impossible', result.error)
      void load()
      return
    }
    void load()
  }, [load])

  const pollStatus = useCallback(async (): Promise<SettlementStatus> => {
    if (!checkout?.providerTransactionId)
      return 'pending'
    const status = await verifyFamilyTopup(checkout.topupId, checkout.providerTransactionId)
    lastPolledRef.current = status
    return status
  }, [checkout])

  const confirmTopup = useCallback(async (reference: string) => {
    const current = checkout
    if (!current)
      return
    setCheckout(null)
    setConfirming(true)
    try {
      announceFamilyTopup(await awaitSettlement(() => verifyFamilyTopup(current.topupId, reference)), true)
    }
    finally {
      setConfirming(false)
      void load()
    }
  }, [checkout, load])

  const cancelCheckout = useCallback(async () => {
    const current = checkout
    const alreadyAnnounced = lastPolledRef.current === 'failed'
    setCheckout(null)
    if (current?.providerTransactionId && !alreadyAnnounced) {
      try {
        announceFamilyTopup(await verifyFamilyTopup(current.topupId, current.providerTransactionId), false)
      }
      catch {
        // Offline: the server's reconciliation takes over.
      }
    }
    void load()
  }, [checkout, load])

  if (checkout) {
    return (
      <PaymentWebView
        url={checkout.paymentUrl}
        transactionId={checkout.providerTransactionId}
        title="Recharge du portefeuille famille"
        onSettled={confirmTopup}
        onCancel={() => {
          void cancelCheckout()
        }}
        pollStatus={pollStatus}
      />
    )
  }

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Portefeuille famille" onBack={onBack} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.green[400]} />
        </View>
      </View>
    )
  }

  const suspended = wallet?.status === 'SUSPENDED'

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Portefeuille famille" onBack={onBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load()
            }}
          />
        )}
      >
        {loadError && (
          <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
            <Text style={[styles.body, { color: semantic.textSecondary }]}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retry}
              onPress={() => {
                setLoading(true)
                void load()
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.retryText, { color: colors.green[600] }]}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loadError && !wallet && (
          <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
            <View style={[styles.introIcon, { backgroundColor: semantic.bgPrimaryLight }]}>
              <UsersRound size={28} color={colors.green[600]} strokeWidth={2} />
            </View>
            <Text style={[styles.introTitle, { color: semantic.textPrimary }]}>
              Faites les courses de vos proches, d’où que vous soyez
            </Text>
            <Text style={[styles.body, { color: semantic.textSecondary }]}>
              Vous rechargez un portefeuille commun, par carte ou Mobile Money. Vos proches au Bénin commandent eux-mêmes sur eBio et paient avec, dans les limites que vous fixez : plafond par mois, maximum par commande, catégories de produits.
            </Text>
            <Text style={[styles.body, { color: semantic.textSecondary }]}>
              Vous voyez chaque achat. Vos proches ne voient jamais le solde total.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, opening && styles.disabled]}
              onPress={() => {
                void handleOpen()
              }}
              disabled={opening}
              accessibilityRole="button"
              accessibilityState={{ busy: opening }}
            >
              {opening
                ? <ActivityIndicator color={colors.neutral[0]} />
                : <Text style={styles.primaryButtonText}>Ouvrir mon portefeuille famille</Text>}
            </TouchableOpacity>
          </View>
        )}

        {wallet && (
          <>
            {confirming && (
              <View style={[styles.banner, { backgroundColor: semantic.bgCard }]}>
                <ActivityIndicator size="small" color={colors.green[400]} />
                <Text style={[styles.body, { color: semantic.textSecondary }]}>Confirmation du paiement en cours…</Text>
              </View>
            )}

            {suspended && (
              <View style={[styles.banner, { backgroundColor: colors.earth[50] }]}>
                <CirclePause size={18} color={colors.earth[600]} strokeWidth={2} />
                <Text style={[styles.body, styles.flex, { color: colors.earth[800] }]}>
                  Portefeuille suspendu : vos proches ne peuvent pas payer avec pour le moment.
                </Text>
              </View>
            )}

            <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
              <Text style={[styles.overline, { color: semantic.textTertiary }]}>Solde du portefeuille famille</Text>
              <Text style={[styles.balance, { color: semantic.textPrimary }]}>{formatMoney(wallet.balance).primary}</Text>
              {currency !== 'XOF' && (
                <Text style={[styles.balanceSecondary, { color: semantic.textSecondary }]}>
                  {`soit ${formatXof(wallet.balance)}`}
                </Text>
              )}
              <View style={styles.actionsRow}>
                <ActionButton label="Recharger" Icon={Plus} onPress={() => setTopupOpen(true)} primary />
                <ActionButton label="Ajouter un proche" Icon={UserPlus} onPress={onAddMember} />
              </View>
              <View style={styles.actionsRow}>
                <ActionButton label="Limites" Icon={SlidersHorizontal} onPress={onOpenLimits} />
                <ActionButton label="Historique" Icon={History} onPress={onOpenHistory} />
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>Mes proches</Text>
            <View style={[styles.card, styles.listCard, { backgroundColor: semantic.bgCard }]}>
              {wallet.members.length === 0
                ? (
                    <Text style={[styles.body, styles.empty, { color: semantic.textSecondary }]}>
                      Aucun proche pour l’instant. Ajoutez-en un : il recevra un SMS pour commencer ses courses.
                    </Text>
                  )
                : wallet.members.map((member, index) => (
                    <MemberRow key={member.id} member={member} isFirst={index === 0} />
                  ))}
            </View>
          </>
        )}
      </ScrollView>

      <FamilyTopupSheet
        visible={topupOpen}
        onClose={() => setTopupOpen(false)}
        onCheckout={(start) => {
          setTopupOpen(false)
          lastPolledRef.current = 'pending'
          setCheckout(start)
        }}
        onTransferred={(amount) => {
          setTopupOpen(false)
          appAlert('Virement effectué', `${formatXof(amount)} ont été versés sur le portefeuille famille.`)
          void load()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  content: { padding: spacing[4], gap: spacing[3], paddingBottom: spacing[10] },
  card: { borderRadius: radius.lg, padding: spacing[5], gap: spacing[3] },
  listCard: { paddingVertical: spacing[1], gap: 0 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
  },
  body: { ...typography.bodyS },
  empty: { paddingVertical: spacing[4], textAlign: 'center' },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: { ...typography.h2 },
  overline: { ...typography.overline },
  balance: { fontFamily: fonts.mono, fontSize: 30, lineHeight: 36 },
  balanceSecondary: { ...typography.bodyS, fontFamily: fonts.mono },
  actionsRow: { flexDirection: 'row', gap: spacing[2] },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing[2],
  },
  actionText: { ...typography.caption, fontFamily: fonts.sansSb, flexShrink: 1 },
  primaryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
  },
  primaryButtonText: { ...typography.h3, color: colors.neutral[0] },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { ...typography.h3 },
  disabled: { opacity: 0.5 },
  sectionTitle: { ...typography.overline, marginTop: spacing[3] },
  memberRow: { paddingVertical: spacing[3], gap: spacing[2] },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  memberName: { ...typography.bodyL, fontFamily: fonts.sansSb, flex: 1 },
  memberStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  memberStatusText: { ...typography.caption },
  gaugeTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  gaugeFill: { height: 8, borderRadius: radius.pill },
  memberSpent: { ...typography.caption },
})
