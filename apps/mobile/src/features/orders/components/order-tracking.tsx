import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Banknote from 'lucide-react-native/dist/esm/icons/banknote'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import ClipboardList from 'lucide-react-native/dist/esm/icons/clipboard-list'
import House from 'lucide-react-native/dist/esm/icons/house'
import ImageIcon from 'lucide-react-native/dist/esm/icons/image'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Store from 'lucide-react-native/dist/esm/icons/store'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ScreenHeader } from '../../common/components/screen-header'

type OrderStatus = 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED'
type PickupMode = 'ON_SITE' | 'DELIVERY'
type PaymentMethod = 'FEDAPAY' | 'CASH_ON_DELIVERY'

interface OrderItemDetail {
  productName: string
  productPhoto: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface StatusStep {
  status: OrderStatus
  label: string
  reachedAt: string | null
}

interface OrderDetail {
  id: string
  orderNumber: string
  supplierName: string
  supplierId: string
  currentStatus: OrderStatus
  deliveryConfirmedByBuyer: boolean
  steps: StatusStep[]
  items: OrderItemDetail[]
  total: number
  pickupMode: PickupMode
  paymentMethod: PaymentMethod
  deliveryAddress: string | null
  createdAt: string
}

interface OrderTrackingProps {
  orderId: string
  onBack?: () => void
  onOpenChat: (supplierId: string) => void
}

const STATUS_ORDER: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED']

const STATUS_ICON_SIZE = 20

const STATUS_CONFIG: Record<OrderStatus, { label: string, heroLabel: string }> = {
  PLACED: { label: 'Commande passée', heroLabel: 'Commande passée' },
  ACCEPTED: { label: 'Acceptée par le fournisseur', heroLabel: 'Commande acceptée' },
  PREPARING: { label: 'En cours de préparation', heroLabel: 'En préparation' },
  READY: { label: 'Prête pour retrait / livraison', heroLabel: 'Commande prête' },
  IN_DELIVERY: { label: 'En cours de livraison', heroLabel: 'En livraison' },
  DELIVERED: { label: 'Livrée avec succès', heroLabel: 'Livrée' },
  CANCELLED: { label: 'Annulée', heroLabel: 'Commande annulée' },
}

function getStatusIcon(status: OrderStatus, color: string): React.ReactNode {
  const size = STATUS_ICON_SIZE
  switch (status) {
    case 'PLACED': return <ClipboardList size={size} color={color} />
    case 'ACCEPTED': return <CircleCheck size={size} color={color} />
    case 'PREPARING': return <Package size={size} color={color} />
    case 'READY': return <Package size={size} color={color} />
    case 'IN_DELIVERY': return <Truck size={size} color={color} />
    case 'DELIVERED': return <House size={size} color={color} />
    case 'CANCELLED': return <ClipboardList size={size} color={color} />
  }
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function OrderTracking({
  orderId,
  onBack,
  onOpenChat,
}: OrderTrackingProps) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [detailsExpanded, setDetailsExpanded] = useState(true)
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()

  const fetchOrder = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}`)
      if (res.ok) {
        const raw = await res.json()
        const mapped: OrderDetail = {
          id: raw.id,
          orderNumber: raw.orderNumber,
          supplierName: raw.supplierName,
          supplierId: raw.supplierId,
          currentStatus: raw.status,
          deliveryConfirmedByBuyer: raw.deliveryConfirmedByBuyer === true,
          total: raw.totalAmount ?? raw.total ?? 0,
          pickupMode: raw.pickupMode ?? 'ON_SITE',
          paymentMethod: raw.paymentMethod ?? 'CASH_ON_DELIVERY',
          deliveryAddress: raw.deliveryAddress ?? null,
          createdAt: raw.createdAt,
          items: ((raw.items ?? []) as Array<Record<string, unknown>>).map(item => ({
            productName: item.productName as string,
            productPhoto: (item.productPhoto ?? null) as string | null,
            quantity: item.quantity as number,
            unitPrice: (item.unitPrice ?? 0) as number,
            totalPrice: (item.totalPrice ?? (item.unitPrice as number ?? 0) * (item.quantity as number ?? 1)) as number,
          })),
          steps: STATUS_ORDER.map(status => ({
            status,
            label: STATUS_CONFIG[status]?.label ?? status,
            reachedAt:
              status === 'PLACED'
                ? raw.createdAt
                : status === 'ACCEPTED'
                  ? raw.acceptedAt
                  : status === 'DELIVERED'
                    ? raw.deliveredAt
                    : null,
          })),
        }
        setOrder(mapped)
      }
    }
    catch {
      // Silently fail
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [orderId])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    fetchOrder()
  }, [fetchOrder])

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true)
    try {
      const res = await apiFetch(`/api/orders/${orderId}/confirm-delivery`, {
        method: 'PATCH',
      })
      if (res.ok) {
        // The confirmation lives on this screen: the banner below replaces the
        // button, no navigation jump.
        setOrder(current => (current ? { ...current, deliveryConfirmedByBuyer: true } : current))
      }
    }
    catch {
      // Silently fail
    }
    finally {
      setIsConfirming(false)
    }
  }, [orderId])

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: semantic.bgPage }]}>
        <Text style={[styles.errorText, { color: semantic.textSecondary }]}>
          Commande introuvable.
        </Text>
      </View>
    )
  }

  const currentStatusIndex = STATUS_ORDER.indexOf(order.currentStatus)
  const isCancelled = order.currentStatus === 'CANCELLED'
  const isDelivered = order.currentStatus === 'DELIVERED'
  const statusConfig = STATUS_CONFIG[order.currentStatus]

  const subtotal = order.items.reduce((sum, item) => sum + item.totalPrice, 0)
  const deliveryFee = order.total - subtotal

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      {/* Header */}
      <ScreenHeader title={`Commande ${order.orderNumber}`} onBack={onBack} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + spacing[6] + (isDelivered ? 76 : 0) }]}
        showsVerticalScrollIndicator={false}
        // The status advances on the supplier's side, with nothing pushed here.
        // Pulling is the only way to see it move without leaving the screen.
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.green[400]}
            colors={[colors.green[400]]}
          />
        )}
      >
        {/* Cancelled banner */}
        {isCancelled && (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledBannerText}>Commande annulée</Text>
          </View>
        )}

        {/* Status hero card */}
        <View style={[styles.heroCard, { backgroundColor: semantic.bgCard }, CARD_SHADOW]}>
          <View style={[
            styles.heroIconCircle,
            {
              backgroundColor: isCancelled ? colors.coral[50] : colors.green[50],
            },
          ]}
          >
            {getStatusIcon(
              order.currentStatus,
              isCancelled ? colors.coral[400] : colors.green[400],
            )}
          </View>
          <Text style={[
            styles.heroStatusLabel,
            {
              color: isCancelled ? colors.coral[600] : semantic.textPrimaryColor,
            },
          ]}
          >
            {statusConfig.heroLabel}
          </Text>
          <View style={styles.heroSupplierRow}>
            <Store size={14} color={semantic.textSecondary} />
            <Text style={[styles.heroSupplierName, { color: semantic.textSecondary }]}>
              Chez
              {' '}
              {order.supplierName}
            </Text>
          </View>
          {order.createdAt && (
            <Text style={[styles.heroDate, { color: semantic.textTertiary }]}>
              {formatDateTime(order.createdAt)}
            </Text>
          )}
        </View>

        {/* Timeline */}
        {!isCancelled && (
          <View style={[styles.sectionCard, { backgroundColor: semantic.bgCard }, CARD_SHADOW]}>
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>
              Suivi
            </Text>
            <View style={styles.timeline}>
              {STATUS_ORDER.map((status, index) => {
                const isReached = index <= currentStatusIndex
                const isActive = index === currentStatusIndex
                const step = order.steps.find(s => s.status === status)
                const config = STATUS_CONFIG[status]
                const isLast = index === STATUS_ORDER.length - 1

                const circleColor = isReached
                  ? colors.green[400]
                  : semantic.borderNormal
                const lineColor = isReached && !isLast
                  ? colors.green[400]
                  : semantic.borderLight
                const iconColor = isReached
                  ? colors.neutral[0]
                  : semantic.textTertiary
                const circleBg = isReached
                  ? colors.green[400]
                  : semantic.bgSurface

                return (
                  <View key={status} style={styles.timelineStep}>
                    <View style={styles.timelineLeft}>
                      {/* Circle */}
                      <View style={[
                        styles.timelineCircle,
                        {
                          backgroundColor: circleBg,
                          borderColor: circleColor,
                        },
                        isActive && styles.timelineCircleActive,
                      ]}
                      >
                        {isReached
                          ? getStatusIcon(status, iconColor)
                          : <View style={[styles.timelineDotInner, { backgroundColor: semantic.borderNormal }]} />}
                      </View>
                      {/* Connector line */}
                      {!isLast && (
                        <View style={[styles.timelineLine, { backgroundColor: lineColor }]} />
                      )}
                    </View>

                    <View style={styles.timelineContent}>
                      <Text style={[
                        styles.timelineLabel,
                        { color: semantic.textTertiary },
                        isReached && { color: semantic.textPrimary, fontFamily: fonts.sansMd },
                        isActive && { color: semantic.textPrimaryColor, fontFamily: fonts.sansSb },
                      ]}
                      >
                        {config.label}
                      </Text>
                      {step?.reachedAt && (
                        <Text style={[styles.timelineTime, { color: semantic.textTertiary }]}>
                          {formatTime(step.reachedAt)}
                        </Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Order details (collapsible) */}
        <View style={[styles.sectionCard, { backgroundColor: semantic.bgCard }, CARD_SHADOW]}>
          <TouchableOpacity
            style={styles.sectionTitleRow}
            onPress={() => setDetailsExpanded(!detailsExpanded)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>
              Détails de la commande
            </Text>
            <View style={[
              styles.chevronContainer,
              detailsExpanded && styles.chevronExpanded,
            ]}
            >
              <ChevronRight size={18} color={semantic.textTertiary} />
            </View>
          </TouchableOpacity>

          {detailsExpanded && (
            <View style={styles.detailsContent}>
              {/* Items */}
              {order.items.map((item, index) => (
                <View key={index}>
                  <View style={styles.itemRow}>
                    <View style={[styles.itemThumb, { backgroundColor: semantic.bgSurface }]}>
                      {item.productPhoto
                        ? (
                            <Image source={{ uri: item.productPhoto }} style={styles.itemThumbImage} />
                          )
                        : (
                            <ImageIcon size={16} color={semantic.textTertiary} />
                          )}
                    </View>
                    <View style={styles.itemInfo}>
                      <Text
                        style={[styles.itemName, { color: semantic.textPrimary }]}
                        numberOfLines={1}
                      >
                        {item.productName}
                      </Text>
                      <Text style={[styles.itemQty, { color: semantic.textTertiary }]}>
                        {item.quantity}
                        x
                        {formatPrice(item.unitPrice)}
                        {' '}
                        FCFA
                      </Text>
                    </View>
                    <Text style={[styles.itemTotal, { color: semantic.textPrimary }]}>
                      {formatPrice(item.totalPrice)}
                      {' '}
                      FCFA
                    </Text>
                  </View>
                  {index < order.items.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
                  )}
                </View>
              ))}

              {/* Totals */}
              <View style={[styles.totalsDivider, { backgroundColor: semantic.borderNormal }]} />
              <View style={styles.totalsSection}>
                <View style={styles.totalsRow}>
                  <Text style={[styles.totalsLabel, { color: semantic.textSecondary }]}>
                    Sous-total
                  </Text>
                  <Text style={[styles.totalsValue, { color: semantic.textSecondary }]}>
                    {formatPrice(subtotal)}
                    {' '}
                    FCFA
                  </Text>
                </View>
                {deliveryFee > 0 && (
                  <View style={styles.totalsRow}>
                    <Text style={[styles.totalsLabel, { color: semantic.textSecondary }]}>
                      Livraison
                    </Text>
                    <Text style={[styles.totalsValue, { color: semantic.textSecondary }]}>
                      {formatPrice(deliveryFee)}
                      {' '}
                      FCFA
                    </Text>
                  </View>
                )}
                <View style={styles.totalsRow}>
                  <Text style={[styles.totalsFinalLabel, { color: semantic.textPrimary }]}>
                    Total
                  </Text>
                  <Text style={[styles.totalsFinalValue, { color: semantic.textPrimaryColor }]}>
                    {formatPrice(order.total)}
                    {' '}
                    FCFA
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Delivery info card */}
        <View style={[styles.sectionCard, { backgroundColor: semantic.bgCard }, CARD_SHADOW]}>
          <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>
            Informations
          </Text>

          {/* Pickup mode */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIconCircle, { backgroundColor: semantic.bgSurface }]}>
              {order.pickupMode === 'DELIVERY'
                ? <Truck size={16} color={semantic.textPrimaryColor} />
                : <Store size={16} color={semantic.textPrimaryColor} />}
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: semantic.textTertiary }]}>Mode</Text>
              <Text style={[styles.infoValue, { color: semantic.textPrimary }]}>
                {order.pickupMode === 'DELIVERY' ? 'Livraison à domicile' : 'Retrait sur place'}
              </Text>
            </View>
          </View>

          {/* Address (delivery only) */}
          {order.pickupMode === 'DELIVERY' && order.deliveryAddress && (
            <View style={styles.infoRow}>
              <View style={[styles.infoIconCircle, { backgroundColor: semantic.bgSurface }]}>
                <MapPin size={16} color={semantic.textPrimaryColor} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoLabel, { color: semantic.textTertiary }]}>Adresse</Text>
                <Text style={[styles.infoValue, { color: semantic.textPrimary }]}>
                  {order.deliveryAddress}
                </Text>
              </View>
            </View>
          )}

          {/* Payment method */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIconCircle, { backgroundColor: semantic.bgSurface }]}>
              <Banknote size={16} color={semantic.textPrimaryColor} />
            </View>
            <View style={styles.infoContent}>
              <Text style={[styles.infoLabel, { color: semantic.textTertiary }]}>Paiement</Text>
              <Text style={[styles.infoValue, { color: semantic.textPrimary }]}>
                {order.paymentMethod === 'FEDAPAY' ? 'FedaPay' : 'Espèces à la livraison'}
              </Text>
            </View>
          </View>
        </View>

        {/* Contact supplier button */}
        <TouchableOpacity
          style={[styles.outlineButton, { borderColor: colors.green[200], backgroundColor: semantic.bgPrimaryLight }]}
          onPress={() => onOpenChat(order.supplierId)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Contacter le fournisseur"
        >
          <MessageCircle size={18} color={colors.green[800]} />
          <Text style={[styles.outlineButtonText, { color: colors.green[800] }]}>
            Contacter le fournisseur
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom action bar */}
      {isDelivered && (
        <View style={[styles.actionBar, { backgroundColor: semantic.bgPage, borderTopColor: semantic.borderLight, paddingBottom: tabBarHeight + spacing[3] }]}>
          {order.deliveryConfirmedByBuyer
            ? (
                <View style={styles.confirmedBanner}>
                  <CircleCheck size={18} color={colors.green[800]} />
                  <Text style={styles.confirmedBannerText}>
                    Réception confirmée. Merci !
                  </Text>
                </View>
              )
            : (
                <TouchableOpacity
                  style={[styles.confirmButton, isConfirming && styles.buttonDisabled]}
                  onPress={handleConfirm}
                  disabled={isConfirming}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Confirmer la réception"
                >
                  {isConfirming
                    ? (
                        <ActivityIndicator size="small" color={colors.neutral[0]} />
                      )
                    : (
                        <>
                          <CircleCheck size={18} color={colors.neutral[0]} />
                          <Text style={styles.confirmButtonText}>
                            J'ai bien reçu ma commande
                          </Text>
                        </>
                      )}
                </TouchableOpacity>
              )}
        </View>
      )}
    </View>
  )
}

const CARD_SHADOW = shadows.sm

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[3],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...typography.bodyL,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    gap: spacing[3],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },

  // Cancelled banner
  cancelledBanner: {
    backgroundColor: colors.coral[50],
    borderRadius: radius.lg,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
  },
  cancelledBannerText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.coral[600],
  },

  // Hero card
  heroCard: {
    borderRadius: radius.xl,
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    gap: spacing[2],
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  heroStatusLabel: {
    fontFamily: fonts.sansBd,
    fontSize: 20,
    lineHeight: 26,
  },
  heroSupplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroSupplierName: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  heroDate: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },

  // Section card
  sectionCard: {
    borderRadius: radius.xl,
    padding: spacing[4],
  },
  sectionTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing[3],
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chevronContainer: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },

  // Timeline
  timeline: {
    paddingLeft: spacing[1],
  },
  timelineStep: {
    flexDirection: 'row',
    minHeight: 56,
  },
  timelineLeft: {
    width: 40,
    alignItems: 'center',
  },
  timelineCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  timelineCircleActive: {
    borderWidth: 3,
    borderColor: colors.green[200],
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 16,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: spacing[3],
    paddingBottom: spacing[3],
    justifyContent: 'center',
    gap: 2,
  },
  timelineLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  timelineTime: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
  },

  // Details content
  detailsContent: {
    marginTop: spacing[2],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    gap: spacing[3],
  },
  itemThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  itemThumbImage: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    lineHeight: 18,
  },
  itemQty: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  itemTotal: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    marginLeft: 40 + spacing[3],
  },

  // Totals
  totalsDivider: {
    height: 1,
    marginTop: spacing[2],
    marginBottom: spacing[3],
  },
  totalsSection: {
    gap: spacing[2],
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  totalsValue: {
    fontFamily: fonts.mono,
    fontSize: 14,
    lineHeight: 20,
  },
  totalsFinalLabel: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    lineHeight: 22,
  },
  totalsFinalValue: {
    fontFamily: fonts.mono,
    fontSize: 16,
    lineHeight: 22,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  infoIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    lineHeight: 20,
  },

  // Buttons
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: radius.lg,
  },
  outlineButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  actionBar: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    paddingBottom: spacing[5],
    borderTopWidth: 1,
  },
  confirmedBanner: {
    alignItems: 'center',
    backgroundColor: colors.green[50],
    borderRadius: radius.xl,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    paddingVertical: spacing[4],
  },
  confirmedBannerText: {
    color: colors.green[800],
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  confirmButton: {
    flexDirection: 'row',
    minHeight: 52,
    backgroundColor: colors.green[400],
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[2],
  },
  confirmButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
