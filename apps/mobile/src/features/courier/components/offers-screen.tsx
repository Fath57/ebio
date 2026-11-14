import type { AcceptResult, DebtBlock, DeclineResult } from '../hooks/use-offers'
import type { CourierOffer, Delivery, DeliveryItem, DeliveryOffer } from '../types'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Banknote from 'lucide-react-native/dist/esm/icons/banknote'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MapPinOff from 'lucide-react-native/dist/esm/icons/map-pin-off'
import PackageIcon from 'lucide-react-native/dist/esm/icons/package'
import Timer from 'lucide-react-native/dist/esm/icons/timer'
import WalletIcon from 'lucide-react-native/dist/esm/icons/wallet'
import Zap from 'lucide-react-native/dist/esm/icons/zap'
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { formatTime, isFutureIso } from '../../../utils/format-time'
import { appAlert } from '../../common/components/app-alert'
import { useValisePalette } from '../../terroir/components/valise/valise-palette'
import { isExportCollection } from '../types'
import { CollectionTag } from './collection-tag'
import { DeliveryItemRow } from './delivery-items-card'

interface OffersScreenProps {
  offers: CourierOffer[]
  refreshing: boolean
  unavailable: boolean
  /** The account lacks the courier rights: only support can fix it. */
  notAllowed: boolean
  /** Wallet debt past the platform limit: runs are withheld until a top-up. */
  debtBlock: DebtBlock | null
  /** Km between the device and the declared zone when clearly outside it. */
  outOfZoneKm: number | null
  onRefresh: () => void
  onAccept: (offer: CourierOffer) => Promise<AcceptResult>
  /** Targeted offers only: hand the run to the next courier in line. */
  onDecline: (offer: CourierOffer) => Promise<DeclineResult>
  onAccepted: (delivery: Delivery | null) => void
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

/** The account is signed in but lacks the courier rights: going online would not help. */
const NOT_ALLOWED_MESSAGE = 'Votre compte n\'a pas les droits de livreur. Contactez le support eBio pour le faire activer.'

/** Thumbnails in the folded strip; past it, a « +N » tile. */
const STRIP_SIZE = 4

/**
 * Average motorbike speed in town, traffic included. Only feeds an order of
 * magnitude (« ≈ 35 min »): the courier compares runs, they do not plan on it.
 */
const AVERAGE_SPEED_KMH = 20

/** Ride length: to the shop, then to the buyer. Null when neither leg is known. */
function totalKm(offer: DeliveryOffer): number | null {
  if (offer.distanceKm === null && offer.routeKm === null) {
    return null
  }
  return (offer.distanceKm ?? 0) + (offer.routeKm ?? 0)
}

function formatDuration(km: number): string {
  const minutes = Math.max(5, Math.round((km / AVERAGE_SPEED_KMH) * 60 / 5) * 5)
  if (minutes < 60) {
    return `≈ ${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `≈ ${hours} h` : `≈ ${hours} h ${String(rest).padStart(2, '0')}`
}

interface OfferItemsProps {
  items: DeliveryItem[]
  itemsCount: number
}

interface ItemThumbProps {
  item: DeliveryItem
}

/** One product of the folded strip: its photo, and the quantity over it. */
function ItemThumb({ item }: ItemThumbProps) {
  const { semantic } = useTheme()
  const [broken, setBroken] = useState(false)
  return (
    <View style={styles.thumb}>
      {item.photo && !broken
        ? (
            <Image
              source={{ uri: item.photo }}
              style={[styles.thumbImage, { backgroundColor: semantic.bgSurface }]}
              resizeMode="cover"
              onError={() => setBroken(true)}
              accessibilityIgnoresInvertColors
            />
          )
        : (
            <View style={[styles.thumbImage, styles.thumbFallback, { backgroundColor: semantic.bgPage }]}>
              <PackageIcon size={18} color={semantic.textTertiary} strokeWidth={2} />
            </View>
          )}
      <View style={styles.thumbQty}>
        <Text style={styles.thumbQtyText}>{`×${item.quantity}`}</Text>
      </View>
    </View>
  )
}

/**
 * What the courier will carry. Folded, a strip of photos sizes up the load in
 * one glance and keeps every card the same height; unfolded, the line-by-line
 * list says exactly what to ask for at the counter.
 */
function OfferItems({ items, itemsCount }: OfferItemsProps) {
  const { semantic } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const units = items.reduce((sum, item) => sum + item.quantity, 0)
  const title = items.length > 0
    ? `À récupérer · ${items.length} produit${items.length > 1 ? 's' : ''}, ${units} article${units > 1 ? 's' : ''}`
    : `À récupérer · ${itemsCount} article${itemsCount > 1 ? 's' : ''}`

  if (items.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: semantic.textSecondary }]}>{title}</Text>
      </View>
    )
  }

  const strip = items.slice(0, items.length > STRIP_SIZE ? STRIP_SIZE - 1 : STRIP_SIZE)
  const rest = items.length - strip.length

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded(previous => !previous)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}. ${expanded ? 'Masquer' : 'Afficher'} le détail`}
      >
        <Text style={[styles.sectionTitle, { color: semantic.textSecondary }]}>{title}</Text>
        <View style={styles.sectionToggle}>
          <Text style={[styles.moreText, { color: semantic.textPrimaryColor }]}>{expanded ? 'Masquer' : 'Détail'}</Text>
          {expanded
            ? <ChevronUp size={16} color={semantic.textPrimaryColor} strokeWidth={2} />
            : <ChevronDown size={16} color={semantic.textPrimaryColor} strokeWidth={2} />}
        </View>
      </Pressable>
      {expanded
        ? items.map((item, index) => (
            <DeliveryItemRow
              // eslint-disable-next-line react/no-array-index-key -- lines have no id of their own; a gift repeats its product
              key={`${item.name}-${item.variantLabel ?? ''}-${index}`}
              item={item}
            />
          ))
        : (
            <View style={styles.strip}>
              {strip.map((item, index) => (
                // eslint-disable-next-line react/no-array-index-key -- lines have no id of their own; a gift repeats its product
                <ItemThumb key={`${item.name}-${item.variantLabel ?? ''}-${index}`} item={item} />
              ))}
              {rest > 0
                ? (
                    <View style={[styles.thumbImage, styles.thumbFallback, { backgroundColor: semantic.bgPage }]}>
                      <Text style={[styles.moreText, { color: semantic.textSecondary }]}>{`+${rest}`}</Text>
                    </View>
                  )
                : null}
            </View>
          )}
    </View>
  )
}

interface MoneyRowProps {
  label: string
  amount: string
  color: string
}

function MoneyRow({ label, amount, color }: MoneyRowProps) {
  return (
    <View style={styles.moneyRow}>
      <Text style={[styles.moneyLabel, { color }]}>{label}</Text>
      <Text style={[styles.moneyAmount, { color }]}>{amount}</Text>
    </View>
  )
}

interface CashBreakdownProps {
  offer: DeliveryOffer
}

/**
 * The cash the courier handles, as a statement rather than a sentence: the
 * advance is what they risk, and the gap between what they keep and what they
 * earn is eBio's commission, debited from their wallet, said here so it
 * never reads as a mistake.
 */
function CashBreakdown({ offer }: CashBreakdownProps) {
  const { isDark } = useTheme()
  const toShop = offer.cashToShop ?? 0
  const toCollect = offer.cashToCollect ?? offer.totalAmount
  const kept = toCollect - toShop
  const commission = kept - (offer.courierFee ?? 0)
  const text = isDark ? colors.earth[100] : colors.earth[800]

  return (
    <View
      style={[
        styles.cashBox,
        { backgroundColor: isDark ? colors.earth[900] : colors.earth[50], borderColor: isDark ? colors.earth[800] : colors.earth[200] },
      ]}
    >
      <View style={styles.cashTitleRow}>
        <Banknote size={16} color={text} strokeWidth={2} />
        <Text style={[styles.cashTitle, { color: text }]}>Paiement en espèces</Text>
      </View>
      <MoneyRow label="Vous avancez à la boutique" amount={formatSignedAmount(-toShop)} color={text} />
      <MoneyRow label="L'acheteur vous remet" amount={`+${formatAmount(toCollect)}`} color={text} />
      <View style={[styles.cashDivider, { backgroundColor: isDark ? colors.earth[800] : colors.earth[200] }]} />
      <MoneyRow label="Vous gardez" amount={formatAmount(kept)} color={text} />
      {commission > 0
        ? (
            <Text style={[styles.cashHint, { color: text }]}>
              {`Commission eBio de ${formatAmount(commission)} prélevée sur votre portefeuille.`}
            </Text>
          )
        : null}
    </View>
  )
}

interface OfferCardProps {
  offer: DeliveryOffer
  /** This offer's accept or decline is in flight. */
  busy: boolean
  /** Another offer's answer is in flight: one answer at a time. */
  locked: boolean
  onAccept: () => void
  onDecline: () => void
}

/**
 * One delivery offered to the courier.
 *
 * Read top to bottom in the order the decision is made: what it pays and how
 * far it goes, where to, what to carry, the cash to handle, then the answer.
 * The order number, useless for deciding, closes the card.
 */
function OfferCard({ offer, busy, locked, onAccept, onDecline }: OfferCardProps) {
  const { semantic, isDark } = useTheme()
  const palette = useValisePalette()
  // « La Valise du pays »: from the shop to the eBio hub, paid by eBio, no buyer.
  const collection = isExportCollection(offer)
  const hub = collection ? offer.exportHub ?? null : null
  const isCash = !collection && offer.paymentMethod === 'CASH_ON_DELIVERY'
  const targeted = offer.isTargeted
  const km = totalKm(offer)
  const items = offer.items ?? []
  const disabled = busy || locked

  const cardStyle = targeted
    ? [styles.card, styles.targetedCard, { backgroundColor: isDark ? colors.green[900] : colors.green[50] }]
    : collection
      ? [styles.card, styles.collectionCard, { backgroundColor: semantic.bgCard, borderColor: palette.leather }]
      : [styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]
  const runNoun = collection ? 'la collecte' : 'la course'

  return (
    <View style={cardStyle}>
      {targeted
        ? (
            <View style={styles.targetedHeader}>
              <View style={styles.targetedBadge} accessibilityLabel="Course proposée en priorité">
                <Zap size={12} color={colors.neutral[0]} strokeWidth={2.4} />
                <Text style={styles.targetedBadgeText}>Proposée en priorité</Text>
              </View>
              {offer.expiresAt ? <Countdown expiresAt={offer.expiresAt} /> : null}
            </View>
          )
        : null}

      {collection ? <CollectionTag style={styles.collectionTag} /> : null}

      <View style={styles.hero}>
        <View style={styles.heroLeft}>
          <Text style={[styles.heroLabel, { color: semantic.textSecondary }]}>Vous gagnez</Text>
          <Text
            style={[styles.earning, { color: semantic.textPrimaryColor }]}
            accessibilityLabel={`Vous gagnez ${formatAmount(offer.courierFee ?? 0)}`}
          >
            {formatAmount(offer.courierFee ?? 0)}
          </Text>
        </View>
        {km !== null
          ? (
              <View style={styles.heroRight}>
                <Text style={[styles.heroKm, { color: semantic.textPrimary }]}>{`≈ ${formatKm(km)}`}</Text>
                <Text style={[styles.heroLabel, { color: semantic.textSecondary }]}>{formatDuration(km)}</Text>
              </View>
            )
          : null}
      </View>

      {isCash || isFutureIso(offer.pickupReadyAt)
        ? (
            <View style={styles.chips}>
              {isCash
                ? (
                    <View style={styles.cashBadge} accessibilityLabel="Commande payée en espèces">
                      <Banknote size={12} color={colors.earth[800]} strokeWidth={2.2} />
                      <Text style={styles.cashBadgeText}>Espèces</Text>
                    </View>
                  )
                : null}
              {isFutureIso(offer.pickupReadyAt)
                ? (
                    <View style={[styles.chip, { backgroundColor: semantic.bgPage, borderColor: semantic.borderNormal }]}>
                      <Clock size={12} color={semantic.textSecondary} strokeWidth={2.2} />
                      <Text style={[styles.chipText, { color: semantic.textSecondary }]}>
                        {`Prête vers ${formatTime(offer.pickupReadyAt)}`}
                      </Text>
                    </View>
                  )
                : null}
            </View>
          )
        : null}

      <View style={styles.route}>
        <View style={styles.stop}>
          <View style={styles.rail}>
            <View style={[styles.dot, { backgroundColor: colors.green[600] }]} />
            <View style={[styles.railLine, { backgroundColor: semantic.borderNormal }]} />
          </View>
          <View style={styles.stopBody}>
            <Text style={[styles.stopTitle, { color: semantic.textPrimary }]} numberOfLines={1}>
              {collection ? `De : ${offer.supplierShopName}` : offer.supplierShopName}
            </Text>
            <Text style={[styles.stopAddress, { color: semantic.textSecondary }]} numberOfLines={2}>{offer.pickupAddress}</Text>
            {offer.distanceKm !== null
              ? (
                  <Text style={[styles.stopMeta, { color: semantic.textSecondary }]}>
                    {`À ${formatKm(offer.distanceKm)} de vous`}
                  </Text>
                )
              : null}
          </View>
        </View>
        <View style={styles.stop}>
          <View style={styles.rail}>
            <View style={[styles.dot, { backgroundColor: collection ? palette.sky : colors.blue[600] }]} />
          </View>
          <View style={styles.stopBody}>
            <Text style={[styles.stopTitle, { color: semantic.textPrimary }]} numberOfLines={3}>
              {collection
                ? `Vers : ${hub ? `${hub.name}, ${hub.address}` : offer.dropoffAddress}`
                : offer.dropoffAddress}
            </Text>
            {hub?.hours
              ? (
                  <View style={styles.stopMetaRow}>
                    <Clock size={12} color={semantic.textSecondary} strokeWidth={2.2} />
                    <Text style={[styles.stopMetaInline, { color: semantic.textSecondary }]}>{`Horaires : ${hub.hours}`}</Text>
                  </View>
                )
              : null}
            <View style={styles.stopMetaRow}>
              {offer.dropoffPosition
                ? <MapPin size={12} color={colors.blue[600]} strokeWidth={2.2} />
                : <MapPinOff size={12} color={colors.earth[600]} strokeWidth={2.2} />}
              <Text style={[styles.stopMetaInline, { color: offer.dropoffPosition ? semantic.textSecondary : colors.earth[600] }]}>
                {[
                  offer.routeKm !== null ? `${formatKm(offer.routeKm)} depuis la boutique` : null,
                  collection ? 'Point de regroupement eBio' : offer.dropoffPosition ? 'Point exact' : 'Adresse approximative',
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <OfferItems items={items} itemsCount={offer.itemsCount} />

      {isCash && offer.cashToShop !== null
        ? <CashBreakdown offer={offer} />
        : (
            <Text style={[styles.paidNote, { color: collection ? palette.inkSoft : semantic.textSecondary }]}>
              {collection ? 'Payée par eBio, rien à encaisser.' : 'Commande déjà payée : rien à encaisser.'}
            </Text>
          )}

      <View style={styles.actions}>
        {targeted
          ? (
              <Pressable
                style={[styles.declineButton, disabled && styles.buttonDisabled]}
                onPress={onDecline}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                accessibilityLabel={`Refuser ${runNoun} ${offer.orderNumber}`}
              >
                <Text style={[styles.declineText, { color: semantic.textPrimaryColor }]}>Refuser</Text>
              </Pressable>
            )
          : null}
        <Pressable
          style={[styles.acceptButton, disabled && styles.buttonDisabled]}
          onPress={onAccept}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled, busy }}
          accessibilityLabel={`Accepter ${runNoun} ${offer.orderNumber}`}
        >
          {busy
            ? <ActivityIndicator color={colors.neutral[0]} />
            : <Text style={styles.acceptText}>{collection ? 'Accepter la collecte' : 'Accepter la course'}</Text>}
        </Pressable>
      </View>

      <Text style={[styles.orderNumber, { color: semantic.textSecondary }]}>{`Commande ${offer.orderNumber}`}</Text>
    </View>
  )
}

/** Feed of nearby deliveries awaiting a courier. Targeted offers first, then first to accept wins. */
export function OffersScreen({ offers, refreshing, unavailable, notAllowed, debtBlock, outOfZoneKm, onRefresh, onAccept, onDecline, onAccepted, onOpenWallet }: OffersScreenProps) {
  const { semantic } = useTheme()
  // The tab bar floats above the list: without this allowance, the last
  // card's button slides under it and becomes untappable.
  const tabBarHeight = useBottomTabBarHeight()
  // One answer at a time: a second tap while the first is in flight used to
  // send a second accept, which came back as « already taken », by oneself.
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function accept(offer: CourierOffer) {
    setPendingId(offer.id)
    let result: AcceptResult
    try {
      result = await onAccept(offer)
    }
    finally {
      setPendingId(null)
    }
    if (result.ok) {
      onAccepted(result.delivery)
      return
    }
    const nom = 'course'
    if (result.conflict) {
      appAlert(
        'Course indisponible',
        result.message ?? `Un autre livreur a accepté cette ${nom} juste avant vous.`,
      )
    }
    else if (result.gone) {
      appAlert('Commande annulée', `Cette ${nom} a été annulée entre-temps.`)
    }
    else if (result.debtMessage) {
      appAlert('Courses suspendues', result.debtMessage)
    }
    else if (result.forbidden === 'UNAVAILABLE') {
      appAlert('Vous êtes hors ligne', `Passez en ligne pour accepter une ${nom}.`)
    }
    else if (result.forbidden === 'NOT_ALLOWED') {
      appAlert('Compte non autorisé', NOT_ALLOWED_MESSAGE)
    }
    else {
      appAlert('Erreur', 'L\'acceptation a échoué. Vérifiez votre connexion et réessayez.')
    }
  }

  async function decline(offer: CourierOffer) {
    setPendingId(offer.id)
    let result: DeclineResult
    try {
      result = await onDecline(offer)
    }
    finally {
      setPendingId(null)
    }
    if (result.ok) {
      return
    }
    appAlert('Refus impossible', result.message ?? 'Le refus a échoué. Vérifiez votre connexion et réessayez.')
  }

  function renderOffer({ item }: { item: CourierOffer }) {
    return (
      <OfferCard
        offer={item}
        busy={pendingId === item.id}
        locked={pendingId !== null && pendingId !== item.id}
        onAccept={() => accept(item)}
        onDecline={() => decline(item)}
      />
    )
  }

  if (debtBlock) {
    return <DebtBlockedState block={debtBlock} refreshing={refreshing} onRefresh={onRefresh} onOpenWallet={onOpenWallet} />
  }

  return (
    <FlatList
      style={{ backgroundColor: semantic.bgPage }}
      contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing[6] }]}
      data={offers}
      keyExtractor={item => item.id}
      renderItem={renderOffer}
      extraData={pendingId}
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
            {notAllowed ? 'Compte non autorisé' : unavailable ? 'Vous êtes hors ligne' : 'Aucune course pour le moment'}
          </Text>
          <Text style={[styles.emptyBody, { color: semantic.textSecondary }]}>
            {notAllowed
              ? NOT_ALLOWED_MESSAGE
              : unavailable
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
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  collectionCard: {
    borderWidth: 1,
  },
  collectionTag: {
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
    gap: spacing[1],
    backgroundColor: colors.green[600],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    height: 22,
  },
  targetedBadgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.neutral[0],
  },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  countdownText: {
    ...typography.price,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing[3],
  },
  heroLeft: {
    flexShrink: 1,
  },
  heroRight: {
    alignItems: 'flex-end',
  },
  heroLabel: {
    ...typography.caption,
  },
  earning: {
    ...typography.price,
    fontSize: 26,
    lineHeight: 26 * 1.2,
  },
  heroKm: {
    ...typography.price,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    height: 22,
  },
  chipText: {
    ...typography.caption,
    fontSize: 11,
  },
  cashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: colors.earth[50],
    borderWidth: 1,
    borderColor: colors.earth[200],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    height: 22,
  },
  cashBadgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.earth[800],
  },
  route: {
    marginTop: spacing[4],
  },
  stop: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  rail: {
    width: 12,
    alignItems: 'center',
    paddingTop: spacing[1],
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  railLine: {
    flex: 1,
    width: 2,
    marginVertical: spacing[1],
  },
  stopBody: {
    flex: 1,
    paddingBottom: spacing[3],
  },
  stopTitle: {
    ...typography.bodyS,
    fontFamily: typography.h3.fontFamily,
  },
  stopAddress: {
    ...typography.bodyS,
  },
  stopMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[1],
  },
  stopMeta: {
    ...typography.caption,
    marginTop: spacing[1],
  },
  stopMetaInline: {
    ...typography.caption,
    flexShrink: 1,
  },
  section: {
    marginTop: spacing[1],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    minHeight: 44,
  },
  sectionTitle: {
    ...typography.overline,
    flexShrink: 1,
  },
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  strip: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  thumb: {
    position: 'relative',
  },
  thumbImage: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbQty: {
    position: 'absolute',
    right: spacing[1],
    bottom: spacing[1],
    backgroundColor: colors.neutral[800],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[1],
    minWidth: 22,
    alignItems: 'center',
  },
  thumbQtyText: {
    ...typography.price,
    fontSize: 11,
    lineHeight: 16,
    color: colors.neutral[0],
  },
  moreText: {
    ...typography.caption,
    fontSize: 13,
  },
  cashBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[3],
    marginTop: spacing[3],
    gap: spacing[2],
  },
  cashTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cashTitle: {
    ...typography.bodyS,
    fontFamily: typography.h3.fontFamily,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing[3],
  },
  moneyLabel: {
    ...typography.bodyS,
    flexShrink: 1,
  },
  moneyAmount: {
    ...typography.price,
    fontSize: 14,
  },
  cashDivider: {
    height: 1,
  },
  cashHint: {
    ...typography.caption,
  },
  paidNote: {
    ...typography.caption,
    marginTop: spacing[3],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[4],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  declineButton: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[5],
  },
  declineText: {
    ...typography.bodyL,
    fontFamily: typography.h3.fontFamily,
  },
  acceptButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    ...typography.bodyL,
    fontFamily: typography.h3.fontFamily,
    color: colors.neutral[0],
  },
  orderNumber: {
    ...typography.caption,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing[3],
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
