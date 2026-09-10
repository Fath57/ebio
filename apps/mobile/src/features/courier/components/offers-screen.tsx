import type { AcceptResult, DebtBlock, DeclineResult } from '../hooks/use-offers'
import type { DeliveryOffer } from '../types'
import Banknote from 'lucide-react-native/dist/esm/icons/banknote'
import HandCoins from 'lucide-react-native/dist/esm/icons/hand-coins'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MapPinOff from 'lucide-react-native/dist/esm/icons/map-pin-off'
import PackageIcon from 'lucide-react-native/dist/esm/icons/package'
import Store from 'lucide-react-native/dist/esm/icons/store'
import Timer from 'lucide-react-native/dist/esm/icons/timer'
import WalletIcon from 'lucide-react-native/dist/esm/icons/wallet'
import Zap from 'lucide-react-native/dist/esm/icons/zap'
import { useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'

interface OffersScreenProps {
  offers: DeliveryOffer[]
  refreshing: boolean
  unavailable: boolean
  /** Wallet debt past the platform limit: runs are withheld until a top-up. */
  debtBlock: DebtBlock | null
  /** Km between the device and the declared zone when clearly outside it. */
  outOfZoneKm: number | null
  onRefresh: () => void
  onAccept: (offerId: string) => Promise<AcceptResult>
  /** Targeted offers only: hand the run to the next courier in line. */
  onDecline: (offerId: string) => Promise<DeclineResult>
  onAccepted: () => void
  onOpenWallet: () => void
}

function formatKm(km: number): string {
  return `${km.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR').replace(/\u202F/g, ' ')} FCFA`
}

/** Signed amount with a typographic minus sign rather than a hyphen. */
function formatSignedAmount(amount: number): string {
  return amount < 0 ? `\u2212${formatAmount(-amount)}` : formatAmount(amount)
}

interface DebtBlockedStateProps {
  block: DebtBlock
  refreshing: boolean
  onRefresh: () => void
  onOpenWallet: () => void
}

/** Full-screen empty state shown while the wallet debt suspends dispatch. */
function DebtBlockedState({ block, refreshing, onRefresh, onOpenWallet }: DebtBlockedStateProps) {
  const { semantic } = useTheme()
  return (
    <ScrollView
      style={{ backgroundColor: semantic.bgPage }}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green[400]} />}
    >
      <View style={styles.debtCard} accessibilityRole="alert">
        <View style={styles.debtIcon}>
          <WalletIcon size={28} color={colors.coral[600]} strokeWidth={2} />
        </View>
        <Text style={styles.debtTitle}>Courses suspendues</Text>
        <Text style={styles.debtBody}>
          {`Votre portefeuille est à ${formatSignedAmount(block.balance)}. La limite autorisée est de ${formatAmount(block.limit)} de dette. Rechargez votre portefeuille pour recevoir de nouvelles courses.`}
        </Text>
        <Pressable
          style={styles.debtButton}
          onPress={onOpenWallet}
          accessibilityRole="button"
          accessibilityLabel="Recharger mon portefeuille"
        >
          <Text style={styles.debtButtonText}>Recharger mon portefeuille</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

/** Whole seconds left before `expiresAt`, never negative. */
function secondsLeft(expiresAt: string): number {
  const remaining = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)
  return Number.isNaN(remaining) ? 0 : Math.max(0, remaining)
}

interface CountdownProps {
  expiresAt: string
}

/** Live "Répondre dans N s" label for the exclusive window of a targeted offer. */
function Countdown({ expiresAt }: CountdownProps) {
  const [left, setLeft] = useState(() => secondsLeft(expiresAt))

  useEffect(() => {
    setLeft(secondsLeft(expiresAt))
    const interval = setInterval(() => {
      const next = secondsLeft(expiresAt)
      setLeft(next)
      if (next === 0) {
        clearInterval(interval)
      }
    }, 1000)
    return () => {
      clearInterval(interval)
    }
  }, [expiresAt])

  const expired = left === 0
  return (
    <View style={styles.countdown} accessibilityLiveRegion="polite">
      <Timer size={14} color={expired ? colors.coral[600] : colors.green[800]} strokeWidth={2.2} />
      <Text style={[styles.countdownText, { color: expired ? colors.coral[600] : colors.green[800] }]}>
        {expired ? 'Expirée' : `Répondre dans ${left} s`}
      </Text>
    </View>
  )
}

/** Feed of nearby deliveries awaiting a courier. Targeted offers first, then first to accept wins. */
export function OffersScreen({ offers, refreshing, unavailable, debtBlock, outOfZoneKm, onRefresh, onAccept, onDecline, onAccepted, onOpenWallet }: OffersScreenProps) {
  const { semantic, isDark } = useTheme()

  async function accept(offer: DeliveryOffer) {
    const result = await onAccept(offer.id)
    if (result.ok) {
      onAccepted()
      return
    }
    if (result.conflict) {
      appAlert('Course indisponible', result.message ?? 'Un autre livreur a accepté cette course juste avant vous.')
    }
    else if (result.gone) {
      appAlert('Commande annulée', 'Cette commande a été annulée entre-temps.')
    }
    else if (result.debtMessage) {
      appAlert('Courses suspendues', result.debtMessage)
    }
    else if (result.forbidden) {
      appAlert('Indisponible', 'Passez disponible pour accepter une course.')
    }
    else {
      appAlert('Erreur', 'L\'acceptation a échoué. Vérifiez votre connexion et réessayez.')
    }
  }

  async function decline(offer: DeliveryOffer) {
    const result = await onDecline(offer.id)
    if (result.ok) {
      return
    }
    appAlert('Refus impossible', result.message ?? 'Le refus a échoué. Vérifiez votre connexion et réessayez.')
  }

  function renderOffer({ item }: { item: DeliveryOffer }) {
    const isCash = item.paymentMethod === 'CASH_ON_DELIVERY'
    const targeted = item.isTargeted
    const cardStyle = targeted
      ? [styles.card, styles.targetedCard, { backgroundColor: isDark ? colors.green[900] : colors.green[50] }]
      : [styles.card, { backgroundColor: semantic.bgCard }]
    return (
      <View style={cardStyle}>
        {targeted
          ? (
              <View style={styles.targetedHeader}>
                <View style={styles.targetedBadge} accessibilityLabel="Course proposée en priorité">
                  <Zap size={12} color={colors.neutral[0]} strokeWidth={2.4} />
                  <Text style={styles.targetedBadgeText}>Proposée en priorité</Text>
                </View>
                {item.expiresAt ? <Countdown expiresAt={item.expiresAt} /> : null}
              </View>
            )
          : null}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={[styles.orderNumber, { color: semantic.textTertiary }]}>{item.orderNumber}</Text>
            {isCash
              ? (
                  <View style={styles.cashBadge} accessibilityLabel="Commande payée en espèces">
                    <Banknote size={12} color={colors.earth[800]} strokeWidth={2.2} />
                    <Text style={styles.cashBadgeText}>Espèces</Text>
                  </View>
                )
              : null}
          </View>
          {item.distanceKm !== null
            ? (
                <Text style={[styles.distance, { color: semantic.textPrimaryColor }]}>
                  {`Boutique à ${formatKm(item.distanceKm)}`}
                </Text>
              )
            : null}
        </View>

        <View style={styles.line}>
          <Store size={16} color={colors.green[600]} strokeWidth={2} />
          <Text style={[styles.lineText, { color: semantic.textPrimary }]} numberOfLines={2}>
            {`${item.supplierShopName} — ${item.pickupAddress}`}
          </Text>
        </View>
        <View style={styles.line}>
          <MapPin size={16} color={colors.coral[400]} strokeWidth={2} />
          <View style={styles.lineText}>
            <Text style={[styles.lineText, { color: semantic.textPrimary }]} numberOfLines={2}>{item.dropoffAddress}</Text>
            <Text style={[styles.lineHint, { color: item.dropoffPosition ? colors.green[800] : semantic.textTertiary }]}>
              {item.dropoffPosition
                ? `Position GPS exacte${item.routeKm !== null ? ` · trajet ≈ ${formatKm(item.routeKm)}` : ''}`
                : 'Adresse approximative (pas de point GPS)'}
            </Text>
          </View>
        </View>
        <View style={styles.line}>
          <PackageIcon size={16} color={semantic.textTertiary} strokeWidth={2} />
          <Text style={[styles.lineText, { color: semantic.textSecondary }]}>
            {`${item.itemsCount} article${item.itemsCount > 1 ? 's' : ''}`}
          </Text>
          <Text style={[styles.amount, { color: semantic.textPrimary }]}>{formatAmount(item.totalAmount)}</Text>
        </View>
        <View style={styles.line}>
          <HandCoins size={16} color={colors.green[600]} strokeWidth={2} />
          <Text style={[styles.lineText, { color: semantic.textPrimaryColor }]}>
            {`Vous gagnez ${formatAmount(item.courierFee ?? 0)}`}
          </Text>
        </View>
        {isCash && item.cashToShop !== null
          ? (
              <View style={styles.line}>
                <Banknote size={16} color={colors.earth[600]} strokeWidth={2} />
                <Text style={[styles.lineText, { color: colors.earth[800] }]}>
                  {`Vous payez la boutique ${formatAmount(item.cashToShop)} au retrait · le client vous remet ${formatAmount(item.cashToCollect ?? item.totalAmount)} à la livraison`}
                </Text>
              </View>
            )
          : null}

        {targeted
          ? (
              <View style={styles.actions}>
                <Pressable
                  style={styles.declineButton}
                  onPress={() => decline(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Refuser la course ${item.orderNumber}`}
                >
                  <Text style={styles.declineText}>Refuser</Text>
                </Pressable>
                <Pressable
                  style={[styles.acceptButton, styles.actionGrow]}
                  onPress={() => accept(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Accepter la course ${item.orderNumber}`}
                >
                  <Text style={styles.acceptText}>Accepter la course</Text>
                </Pressable>
              </View>
            )
          : (
              <Pressable
                style={styles.acceptButton}
                onPress={() => accept(item)}
                accessibilityRole="button"
                accessibilityLabel={`Accepter la course ${item.orderNumber}`}
              >
                <Text style={styles.acceptText}>Accepter la course</Text>
              </Pressable>
            )}
      </View>
    )
  }

  if (debtBlock) {
    return <DebtBlockedState block={debtBlock} refreshing={refreshing} onRefresh={onRefresh} onOpenWallet={onOpenWallet} />
  }

  return (
    <FlatList
      style={{ backgroundColor: semantic.bgPage }}
      contentContainerStyle={styles.list}
      data={offers}
      keyExtractor={item => item.id}
      renderItem={renderOffer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green[400]} />}
      ListHeaderComponent={outOfZoneKm !== null
        ? (
            <View style={styles.zoneBanner} accessibilityRole="alert">
              <MapPinOff size={18} color={colors.earth[800]} strokeWidth={2} />
              <Text style={styles.zoneBannerText}>
                {`Vous êtes à ${formatKm(outOfZoneKm)} de votre zone de livraison. Les courses ne vous sont proposées que lorsque vous y êtes.`}
              </Text>
            </View>
          )
        : null}
      ListEmptyComponent={(
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: semantic.textPrimary }]}>
            {unavailable ? 'Vous êtes hors ligne' : 'Aucune course pour le moment'}
          </Text>
          <Text style={[styles.emptyBody, { color: semantic.textSecondary }]}>
            {unavailable
              ? 'Passez en ligne pour recevoir les courses proches de vous.'
              : 'Les nouvelles courses proches de vous apparaîtront ici. Tirez pour actualiser.'}
          </Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    padding: spacing[4],
    paddingBottom: spacing[12],
    flexGrow: 1,
  },
  zoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.earth[50],
    borderWidth: 1,
    borderColor: colors.earth[200],
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },
  zoneBannerText: {
    ...typography.caption,
    flex: 1,
    color: colors.earth[800],
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  targetedCard: {
    borderWidth: 2,
    borderColor: colors.green[400],
  },
  targetedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  targetedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  targetedBadgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.neutral[0],
  },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countdownText: {
    ...typography.price,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  actionGrow: {
    flex: 1,
    marginTop: 0,
  },
  declineButton: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  declineText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.green[600],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexShrink: 1,
  },
  orderNumber: {
    ...typography.caption,
  },
  cashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.earth[50],
    borderWidth: 1,
    borderColor: colors.earth[200],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  cashBadgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.earth[800],
  },
  distance: {
    ...typography.price,
    fontSize: 13,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  lineText: {
    ...typography.bodyS,
    flex: 1,
  },
  lineHint: {
    ...typography.caption,
    marginTop: 2,
  },
  amount: {
    ...typography.price,
    fontSize: 14,
  },
  acceptButton: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  acceptText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
  debtCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral[50],
    borderWidth: 1,
    borderColor: colors.coral[100],
    borderRadius: radius.lg,
    padding: spacing[6],
  },
  debtIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.coral[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  debtTitle: {
    ...typography.h3,
    color: colors.coral[800],
    textAlign: 'center',
  },
  debtBody: {
    ...typography.bodyS,
    color: colors.coral[800],
    textAlign: 'center',
    marginTop: spacing[2],
  },
  debtButton: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.coral[600],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
    marginTop: spacing[5],
    alignSelf: 'stretch',
  },
  debtButtonText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.bodyS,
    textAlign: 'center',
    marginTop: spacing[2],
  },
})
