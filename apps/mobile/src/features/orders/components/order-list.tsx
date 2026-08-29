import { useFocusEffect } from '@react-navigation/native'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import Car from 'lucide-react-native/dist/esm/icons/car'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Footprints from 'lucide-react-native/dist/esm/icons/footprints'
import ImageIcon from 'lucide-react-native/dist/esm/icons/image'
import ShoppingBag from 'lucide-react-native/dist/esm/icons/shopping-bag'
import Store from 'lucide-react-native/dist/esm/icons/store'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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
import { ScreenHeader } from '../../common/components/screen-header'

type OrderStatus = 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED'
type FilterTab = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
type DeliveryRunStatus = 'AWAITING_COURIER' | 'ACCEPTED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED'
type VehicleType = 'MOTO' | 'BICYCLE' | 'CAR' | 'ON_FOOT'

interface DeliveryRun {
  status: DeliveryRunStatus
  courierName: string | null
  courierVehicleType: VehicleType | null
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
  productName: string
  productPhoto: string | null
  quantity: number
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
}

interface OrderListProps {
  onOpenOrder: (orderId: string) => void
}

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

const FILTER_TABS: Array<{ key: FilterTab, label: string }> = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'ACTIVE', label: 'En cours' },
  { key: 'COMPLETED', label: 'Terminées' },
  { key: 'CANCELLED', label: 'Annulées' },
]

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

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

function getFirstPhoto(items: OrderItem[]): string | null {
  if (!items || items.length === 0)
    return null
  return items.find(i => i.productPhoto)?.productPhoto ?? null
}

export function OrderList({ onOpenOrder }: OrderListProps) {
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL')
  const { semantic } = useTheme()

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders?view=buyer')
      if (res.ok) {
        const json = await res.json()
        const raw = Array.isArray(json) ? json : (json.orders ?? json.data ?? [])
        const data: OrderListItem[] = raw.map((o: Record<string, unknown>) => ({
          id: o.id as string,
          orderNumber: o.orderNumber as string,
          supplierName: o.supplierName as string,
          total: (o.totalAmount ?? o.total) as number,
          status: o.status as OrderListItem['status'],
          createdAt: o.createdAt as string,
          items: ((o.items ?? []) as Array<Record<string, unknown>>).map(item => ({
            productName: item.productName as string,
            productPhoto: (item.productPhoto ?? null) as string | null,
            quantity: item.quantity as number,
          })),
          delivery: (o.delivery ?? null) as DeliveryRun | null,
        }))
        setOrders(data)
      }
    }
    catch {
      // Silently fail
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Live delivery line: while a run is in progress and the screen is focused,
  // re-fetch quietly so the courier's progress shows without pull-to-refresh.
  const hasLiveRun = orders.some(o => o.delivery !== null && LIVE_RUN_STATUSES.includes(o.delivery.status))
  useFocusEffect(
    useCallback(() => {
      if (!hasLiveRun) {
        return undefined
      }
      const timer = setInterval(() => {
        void fetchOrders()
      }, LIVE_REFRESH_MS)
      return () => {
        clearInterval(timer)
      }
    }, [hasLiveRun, fetchOrders]),
  )

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    fetchOrders()
  }, [fetchOrders])

  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (activeFilter === 'ACTIVE')
      return ACTIVE_STATUSES.includes(order.status)
    if (activeFilter === 'COMPLETED')
      return order.status === 'DELIVERED'
    if (activeFilter === 'CANCELLED')
      return order.status === 'CANCELLED'
    return true
  }), [orders, activeFilter])

  const orderCount = filteredOrders.length

  const renderItem = useCallback(
    ({ item, index }: { item: OrderListItem, index: number }) => {
      const statusColor = STATUS_COLORS[item.status]
      const photo = getFirstPhoto(item.items)
      const summary = buildItemsSummary(item.items)

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
                      <Image source={{ uri: photo }} style={styles.thumbnailImage} />
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
                {item.delivery && RUN_LABELS[item.delivery.status] && (
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
                      {RUN_LABELS[item.delivery.status]}
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
                  <Text style={[styles.totalPrice, { color: semantic.textPrimaryColor }]}>
                    {formatPrice(item.total)}
                    {' '}
                    FCFA
                  </Text>
                  <View style={styles.dateChevron}>
                    <Text style={[styles.date, { color: semantic.textTertiary }]}>
                      {formatDate(item.createdAt)}
                    </Text>
                    <ChevronRight size={16} color={semantic.textTertiary} />
                  </View>
                </View>
              </View>
            </View>
          </StaggerItem>
        </ScalePressable>
      )
    },
    [onOpenOrder, semantic],
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

      {/* Filter tabs */}
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

      {/* Content */}
      {isLoading
        ? (
            <View style={styles.centeredContainer}>
              <ActivityIndicator size="large" color={colors.green[400]} />
            </View>
          )
        : (
            <FlatList
              data={filteredOrders}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={[
                styles.listContent,
                filteredOrders.length === 0 && styles.listContentEmpty,
              ]}
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
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
    paddingBottom: spacing[10],
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
