import type { FrozenDisplay } from '../../common/hooks/use-money'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import Car from 'lucide-react-native/dist/esm/icons/car'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Footprints from 'lucide-react-native/dist/esm/icons/footprints'
import ImageIcon from 'lucide-react-native/dist/esm/icons/image'
import RotateCcw from 'lucide-react-native/dist/esm/icons/rotate-ccw'
import ShoppingBag from 'lucide-react-native/dist/esm/icons/shopping-bag'
import Store from 'lucide-react-native/dist/esm/icons/store'
import * as React from 'react'
import { useCallback, useMemo, useState } from 'react'
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScalePressable, StaggerItem } from '../../../utils/animations'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { ListFooterLoader } from '../../common/components/list-footer-loader'
import { ScreenHeader } from '../../common/components/screen-header'
import { ProductCardSkeletonList } from '../../common/components/skeleton'
import { formatFrozenMoney, parseFrozenDisplay } from '../../common/hooks/use-money'
import { hasMoreAfter, PAGE_SIZE, usePaginatedList } from '../../common/hooks/use-paginated-list'
import { TerroirShipmentsEntry } from '../../terroir/components/shipments-list'
import { useReorder } from '../hooks/use-reorder'
import { ReceivedOrders, useReceivedOrders } from './received-orders'

type OrderStatus = 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED'
type FilterTab = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
type DeliveryRunStatus = 'AWAITING_COURIER' | 'ACCEPTED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED'
type VehicleType = 'MOTO' | 'BICYCLE' | 'CAR' | 'ON_FOOT'

interface DeliveryRun {
  status: DeliveryRunStatus
  courierName: string | null
  courierVehicleType: VehicleType | null
  /**
   * Set when the delivery is part of a run. The buyer then follows
   * one progression, even though their cart produced two orders.
   */
  run: {
    id: string
    shopCount: number
    collectedCount: number
    /** The platform has no options left: the buyer decides. */
    awaitingBuyerDecision: boolean
  } | null
}

/**
 * What the delivery line says when several shops are involved.
 *
 * "Parcel picked up" would be false while some are left to collect, and
 * two contradicting lines on two cards even more so.
 */
function runProgressLabel(delivery: DeliveryRun): string | null {
  const run = delivery.run
  if (run !== null && run.awaitingBuyerDecision) {
    return 'Aucun livreur disponible — attendre ou annuler ?'
  }
  if (run === null || run.shopCount <= 1) {
    return RUN_LABELS[delivery.status]
  }
  if (run.awaitingBuyerDecision) {
    return 'Aucun livreur disponible — attendre ou annuler ?'
  }
  if (delivery.status === 'AWAITING_COURIER') {
    return `Recherche d’un livreur pour vos ${run.shopCount} boutiques…`
  }
  if (delivery.status === 'DELIVERED' || delivery.status === 'CANCELLED') {
    return RUN_LABELS[delivery.status]
  }
  if (delivery.status === 'FAILED') {
    return RUN_LABELS.FAILED
  }
  if (run.collectedCount >= run.shopCount) {
    return 'Livreur en route vers vous'
  }
  return `Collecte en cours · ${run.collectedCount} sur ${run.shopCount} boutiques`
}

/** Buyer-facing wording of the courier run; null = nothing worth a line. */
const RUN_LABELS: Record<DeliveryRunStatus, string | null> = {
  AWAITING_COURIER: 'Recherche d’un livreur…',
  ACCEPTED: 'Livreur en route vers la boutique',
  PICKED_UP: 'Colis récupéré par le livreur',
  IN_TRANSIT: 'Livreur en route vers vous',
  DELIVERED: null,
  FAILED: 'Livraison non aboutie — la boutique vous recontacte',
  CANCELLED: null,
}
const LIVE_RUN_STATUSES: DeliveryRunStatus[] = ['AWAITING_COURIER', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']
const LIVE_REFRESH_MS = 15_000
const VEHICLE_ICONS = { MOTO: Bike, BICYCLE: Bike, CAR: Car, ON_FOOT: Footprints } as const

interface OrderItem {
  /** Needed to put the line back in the basket, at today's price. */
  productId: string
  productName: string
  productPhoto: string | null
  quantity: number
  /** A free unit from a promotion: ordering it again would be asking for a gift. */
  isGift: boolean
}

interface OrderListItem {
  id: string
  orderNumber: string
  supplierName: string
  total: number
  status: OrderStatus
  createdAt: string
  items: OrderItem[]
  delivery: DeliveryRun | null
  /** Currency frozen at checkout; null when paid in FCFA. */
  display: FrozenDisplay | null
}

interface OrderListProps {
  onOpenOrder: (orderId: string) => void
  /** Where « Commander à nouveau » leaves the buyer once the basket is filled. */
  onGoToCart?: () => void
  /** Rating of a basket received from a relative: its products, then its courier. */
  onRateReceivedProducts?: (orderId: string) => void
  onRateReceivedCourier?: (orderId: string, supplierId: string | null) => void
  /** Opens the terroir parcels; the entry hides when there is nothing to show. */
  onOpenTerroirShipments?: () => void
}

type Segment = 'MINE' | 'RECEIVED'

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'En attente de paiement',
  PLACED: 'Passée',
  ACCEPTED: 'Acceptée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  IN_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

const STATUS_COLORS: Record<OrderStatus, { bg: string, text: string, dot: string }> = {
  PENDING_PAYMENT: { bg: colors.earth[50], text: colors.earth[600], dot: colors.earth[400] },
  PLACED: { bg: colors.neutral[100], text: colors.neutral[600], dot: colors.neutral[400] },
  ACCEPTED: { bg: colors.blue[50], text: colors.blue[800], dot: colors.blue[400] },
  PREPARING: { bg: colors.earth[50], text: colors.earth[800], dot: colors.earth[400] },
  READY: { bg: colors.green[50], text: colors.green[800], dot: colors.green[400] },
  IN_DELIVERY: { bg: colors.blue[50], text: colors.blue[600], dot: colors.blue[600] },
  DELIVERED: { bg: colors.green[100], text: colors.green[600], dot: colors.green[400] },
  CANCELLED: { bg: colors.coral[50], text: colors.coral[600], dot: colors.coral[400] },
}

const ACTIVE_STATUSES: OrderStatus[] = ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_DELIVERY']

/** What each tab asks the API for; an empty list means every status. */
const FILTER_STATUSES: Record<FilterTab, OrderStatus[]> = {
  ALL: [],
  ACTIVE: ACTIVE_STATUSES,
  COMPLETED: ['DELIVERED'],
  CANCELLED: ['CANCELLED'],
}

const FILTER_TABS: Array<{ key: FilterTab, label: string }> = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'ACTIVE', label: 'En cours' },
  { key: 'COMPLETED', label: 'Terminées' },
  { key: 'CANCELLED', label: 'Annulées' },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function buildItemsSummary(items: OrderItem[]): string {
  if (!items || items.length === 0)
    return ''
  return items
    .map(item => `${item.quantity}x ${item.productName}`)
    .join(', ')
}

/** One row of `GET /api/orders?view=buyer`, shaped for the list. */
function toOrderListItem(o: Record<string, unknown>): OrderListItem {
  return {
    id: o.id as string,
    orderNumber: o.orderNumber as string,
    supplierName: o.supplierName as string,
    total: (o.totalAmount ?? o.total) as number,
    status: o.status as OrderListItem['status'],
    createdAt: o.createdAt as string,
    items: ((o.items ?? []) as Array<Record<string, unknown>>).map(item => ({
      productId: item.productId as string,
      productName: item.productName as string,
      productPhoto: (item.productPhoto ?? null) as string | null,
      quantity: item.quantity as number,
      isGift: Boolean(item.isGift),
    })),
    delivery: (o.delivery ?? null) as DeliveryRun | null,
    display: parseFrozenDisplay(o.display),
  }
}

/** One page of the buyer's orders, newest first, for a tab's statuses, with their count. */
async function fetchOrdersPage(page: number, statuses: OrderStatus[]): Promise<{ items: OrderListItem[], total: number }> {
  const statusFilter = statuses.length > 0 ? `&status=${statuses.join(',')}` : ''
  const res = await apiFetch(`/api/orders?view=buyer&page=${page}&limit=${PAGE_SIZE}${statusFilter}`)
  if (!res.ok) {
    throw new Error('Chargement des commandes impossible')
  }
  const json = await res.json() as Record<string, unknown>
  const raw = (Array.isArray(json) ? json : (json.orders ?? json.data ?? [])) as Array<Record<string, unknown>>
  const total = typeof json.total === 'number' ? json.total : raw.length
  return { items: raw.map(toOrderListItem), total }
}

function getFirstPhoto(items: OrderItem[]): string | null {
  if (!items || items.length === 0)
    return null
  return items.find(i => i.productPhoto)?.productPhoto ?? null
}

export function OrderList({ onOpenOrder, onGoToCart, onRateReceivedProducts, onRateReceivedCourier, onOpenTerroirShipments }: OrderListProps) {
  const tabBarHeight = useBottomTabBarHeight()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL')
  const [segment, setSegment] = useState<Segment>('MINE')
  const received = useReceivedOrders()
  const [isRefreshingReceived, setIsRefreshingReceived] = useState(false)
  // Most accounts never receive a basket: the segment exists only once one has.
  const hasReceived = received.total > 0
  const showReceived = hasReceived && segment === 'RECEIVED'
  const reloadReceived = received.reload
  const handleRefreshReceived = useCallback(async () => {
    setIsRefreshingReceived(true)
    await reloadReceived()
    setIsRefreshingReceived(false)
  }, [reloadReceived])
  const noop = useCallback(() => {}, [])
  const { semantic } = useTheme()
  const { isPending: isReordering, reorder } = useReorder()

  /**
   * Refills the basket from a past order, then says what could not follow.
   *
   * Silence would be worse than the missing line: the buyer would reach the
   * checkout believing they had ordered the same thing.
   */
  const handleReorder = useCallback(async (order: OrderListItem): Promise<void> => {
    try {
      const outcome = await reorder(order.items)
      if (outcome.added === 0) {
        appAlert('Rien à remettre au panier', 'Aucun produit de cette commande n\'est disponible en ce moment.')
        return
      }
      if (outcome.missing.length > 0) {
        appAlert(
          'Panier rempli en partie',
          `${outcome.added} article${outcome.added > 1 ? 's' : ''} remis au panier. Indisponible${outcome.missing.length > 1 ? 's' : ''} : ${outcome.missing.join(', ')}.`,
        )
      }
      onGoToCart?.()
    }
    catch (caught) {
      appAlert('Impossible pour le moment', caught instanceof Error ? caught.message : 'Réessayez dans un instant.')
    }
  }, [onGoToCart, reorder])

  // The tab's count on the server, not only the orders loaded so far.
  const [totalOrders, setTotalOrders] = useState(0)
  const filterStatuses = FILTER_STATUSES[activeFilter]
  const {
    items: orders,
    isLoading,
    isRefreshing,
    isLoadingMore,
    refresh: handleRefresh,
    loadMore,
    setItems: setOrders,
  } = usePaginatedList<OrderListItem>(async (page) => {
    const result = await fetchOrdersPage(page, filterStatuses)
    setTotalOrders(result.total)
    return { items: result.items, hasMore: hasMoreAfter(page, PAGE_SIZE, result.total) }
  }, activeFilter)

  // Live delivery line: while a run is in progress and the screen is focused,
  // re-read the first page quietly and patch the rows in place, so the
  // courier's progress shows without losing the pages scrolled through.
  const hasLiveRun = orders.some(o => o.delivery !== null && LIVE_RUN_STATUSES.includes(o.delivery.status))
  const pollLatest = useCallback(async () => {
    try {
      const latest = await fetchOrdersPage(1, filterStatuses)
      setTotalOrders(latest.total)
      setOrders((current) => {
        const fresh = new Map(latest.items.map(order => [order.id, order]))
        const known = new Set(current.map(order => order.id))
        const added = latest.items.filter(order => !known.has(order.id))
        return [...added, ...current.map(order => fresh.get(order.id) ?? order)]
      })
    }
    catch {
      // The next tick tries again.
    }
  }, [setOrders, filterStatuses])
  useFocusEffect(
    useCallback(() => {
      if (!hasLiveRun) {
        return undefined
      }
      const timer = setInterval(() => {
        void pollLatest()
      }, LIVE_REFRESH_MS)
      return () => {
        clearInterval(timer)
      }
    }, [hasLiveRun, pollLatest]),
  )

  // The server already filtered by tab; this only drops an order whose status
  // moved out of it since it was loaded (a live poll, for instance).
  const filteredOrders = useMemo(
    () => (filterStatuses.length === 0 ? orders : orders.filter(order => filterStatuses.includes(order.status))),
    [orders, filterStatuses],
  )

  const orderCount = totalOrders

  const renderItem = useCallback(
    ({ item, index }: { item: OrderListItem, index: number }) => {
      const statusColor = STATUS_COLORS[item.status]
      const photo = getFirstPhoto(item.items)
      const summary = buildItemsSummary(item.items)
      const money = formatFrozenMoney(item.total, item.display)

      return (
        <ScalePressable
          style={[styles.card, { backgroundColor: semantic.bgCard }]}
          onPress={() => onOpenOrder(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Commande ${item.orderNumber}`}
        >
          <StaggerItem index={index}>
            <View style={styles.cardRow}>
              {/* Thumbnail */}
              <View style={[styles.thumbnail, { backgroundColor: semantic.bgSurface }]}>
                {photo
                  ? (
                      <Image source={{ uri: photo }} style={styles.thumbnailImage} resizeMode="contain" />
                    )
                  : (
                      <ImageIcon size={24} color={semantic.textTertiary} />
                    )}
              </View>

              {/* Content */}
              <View style={styles.cardContent}>
                {/* Top line: order number + status */}
                <View style={styles.cardTopRow}>
                  <Text
                    style={[styles.orderNumber, { color: semantic.textPrimary }]}
                    numberOfLines={1}
                  >
                    {item.orderNumber}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor.dot }]} />
                    <Text style={[styles.statusText, { color: statusColor.text }]}>
                      {STATUS_LABELS[item.status]}
                    </Text>
                  </View>
                </View>

                {/* Supplier */}
                <View style={styles.supplierRow}>
                  <Store size={13} color={semantic.textSecondary} />
                  <Text
                    style={[styles.supplierName, { color: semantic.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.supplierName}
                  </Text>
                </View>

                {/* Live delivery run */}
                {item.delivery && runProgressLabel(item.delivery) && (
                  <View style={[styles.runRow, { backgroundColor: item.delivery.status === 'FAILED' ? colors.coral[50] : semantic.bgPrimaryLight }]}>
                    {LIVE_RUN_STATUSES.includes(item.delivery.status) && <View style={styles.runDot} />}
                    {(() => {
                      const VehicleIcon = item.delivery.courierVehicleType ? VEHICLE_ICONS[item.delivery.courierVehicleType] : null
                      return VehicleIcon ? <VehicleIcon size={13} color={colors.green[800]} strokeWidth={2.2} /> : null
                    })()}
                    <Text
                      style={[styles.runText, { color: item.delivery.status === 'FAILED' ? colors.coral[600] : colors.green[800] }]}
                      numberOfLines={1}
                    >
                      {runProgressLabel(item.delivery)}
                      {item.delivery.courierName && item.delivery.status !== 'AWAITING_COURIER' ? ` · ${item.delivery.courierName}` : ''}
                    </Text>
                  </View>
                )}

                {/* Items summary */}
                {summary
                  ? (
                      <Text
                        style={[styles.itemsSummary, { color: semantic.textTertiary }]}
                        numberOfLines={1}
                      >
                        {summary}
                      </Text>
                    )
                  : null}

                {/* Bottom: price + date + chevron */}
                <View style={styles.cardBottomRow}>
                  <View>
                    <Text style={[styles.totalPrice, { color: semantic.textPrimaryColor }]}>
                      {money.primary}
                    </Text>
                    {money.secondary && (
                      <Text style={[styles.totalSecondary, { color: semantic.textTertiary }]}>
                        {money.secondary}
                      </Text>
                    )}
                  </View>
                  <View style={styles.dateChevron}>
                    <Text style={[styles.date, { color: semantic.textTertiary }]}>
                      {formatDate(item.createdAt)}
                    </Text>
                    <ChevronRight size={16} color={semantic.textTertiary} />
                  </View>
                </View>

                {/* Le geste le plus fréquent d'un acheteur de courses : refaire
                  * celle de la semaine dernière. Offert seulement une fois la
                  * commande livrée — avant, elle est encore en cours. */}
                {item.status === 'DELIVERED' && (
                  <TouchableOpacity
                    style={[styles.reorderButton, { borderColor: semantic.borderNormal }]}
                    onPress={() => handleReorder(item)}
                    disabled={isReordering}
                    accessibilityRole="button"
                    accessibilityLabel={`Commander à nouveau chez ${item.supplierName}`}
                  >
                    <RotateCcw size={15} color={semantic.textPrimaryColor} />
                    <Text style={[styles.reorderText, { color: semantic.textPrimaryColor }]}>
                      {isReordering ? 'Un instant…' : 'Commander à nouveau'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </StaggerItem>
        </ScalePressable>
      )
    },
    [handleReorder, isReordering, onOpenOrder, semantic],
  )

  const keyExtractor = useCallback((item: OrderListItem) => item.id, [])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title="Mes commandes"
        subtitle={!isLoading && orderCount > 0
          ? `${orderCount} commande${orderCount > 1 ? 's' : ''}`
          : undefined}
      />

      {onOpenTerroirShipments && <TerroirShipmentsEntry onPress={onOpenTerroirShipments} />}

      {hasReceived && (
        <View style={styles.segmentRow} accessibilityRole="tablist">
          {([['MINE', 'Mes commandes'], ['RECEIVED', 'Paniers reçus']] as const).map(([key, label]) => {
            const isActive = segment === key
            return (
              <TouchableOpacity
                key={key}
                style={[styles.segmentTab, { borderBottomColor: isActive ? colors.green[600] : 'transparent' }]}
                onPress={() => setSegment(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.segmentText, { color: isActive ? semantic.textPrimaryColor : semantic.textSecondary }, isActive && styles.filterTabTextActive]}>
                  {key === 'RECEIVED' ? `${label} (${received.total})` : label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {showReceived && (
        <ReceivedOrders
          items={received.items}
          isRefreshing={isRefreshingReceived}
          onRefresh={handleRefreshReceived}
          onRateProducts={onRateReceivedProducts ?? noop}
          onRateCourier={onRateReceivedCourier ?? noop}
          bottomInset={tabBarHeight + spacing[6]}
        />
      )}

      {/* Filter tabs */}
      {!showReceived && (
        <View style={styles.filterRow}>
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.key
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterTab,
                  { backgroundColor: isActive ? semantic.bgPrimaryLight : 'transparent' },
                ]}
                onPress={() => setActiveFilter(tab.key)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    { color: isActive ? semantic.textPrimaryColor : semantic.textTertiary },
                    isActive && styles.filterTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {/* Content */}
      {showReceived
        ? null
        : isLoading
          ? (
              <View style={styles.skeletonContainer}>
                <ProductCardSkeletonList count={3} />
              </View>
            )
          : (
              <FlatList
                data={filteredOrders}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                contentContainerStyle={[
                  styles.listContent,
                  // The tab bar floats over the list: without its height the
                  // last card sits underneath it.
                  { paddingBottom: tabBarHeight + spacing[6] },
                  filteredOrders.length === 0 && styles.listContentEmpty,
                ]}
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                onEndReached={loadMore}
                onEndReachedThreshold={0.5}
                ListFooterComponent={<ListFooterLoader isLoading={isLoadingMore} />}
                showsVerticalScrollIndicator={false}
                // Rendered inside the list rather than beside it: an empty state
                // laid out as a sibling cannot be pulled, and waiting for a first
                // order is exactly when one reaches for a refresh.
                ListEmptyComponent={(
                  <View style={styles.centeredContainer}>
                    <View style={[styles.emptyIconCircle, { backgroundColor: semantic.bgPrimaryLight }]}>
                      <ShoppingBag size={32} color={colors.green[400]} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: semantic.textPrimary }]}>
                      Aucune commande
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: semantic.textTertiary }]}>
                      Vos commandes apparaîtront ici
                    </Text>
                  </View>
                )}
              />
            )}
    </View>
  )
}

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    gap: spacing[4],
  },
  segmentTab: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 2,
  },
  segmentText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  reorderButton: {
    marginTop: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
  },
  reorderText: {
    fontFamily: fonts.sansSb,
    fontSize: typography.bodyS.fontSize,
  },
  screen: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  headerTitle: {
    ...typography.h1,
  },
  countBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  countBadgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
    lineHeight: 16,
  },

  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  filterTab: {
    minHeight: 36,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  filterTabText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  filterTabTextActive: {
    fontFamily: fonts.sansSb,
  },

  // List
  listContentEmpty: {
    flexGrow: 1,
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[3],
  },

  // Card
  card: {
    borderRadius: radius.xl,
    padding: spacing[3],
    ...shadows.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },

  // Thumbnail
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
  },

  // Card content
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    lineHeight: 14,
  },

  // Live delivery run
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  runDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green[400],
  },
  runText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    lineHeight: 14,
    flexShrink: 1,
  },

  // Supplier row
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  supplierName: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    flexShrink: 1,
  },

  // Items summary
  itemsSummary: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },

  // Bottom row
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  totalPrice: {
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 18,
  },
  totalSecondary: {
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  dateChevron: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  date: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
  },

  // Empty state
  skeletonContainer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[8],
    gap: spacing[3],
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodyS,
    textAlign: 'center',
  },
})
