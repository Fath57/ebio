import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
import Banknote from 'lucide-react-native/dist/esm/icons/banknote'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import Car from 'lucide-react-native/dist/esm/icons/car'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import ClipboardList from 'lucide-react-native/dist/esm/icons/clipboard-list'
import Footprints from 'lucide-react-native/dist/esm/icons/footprints'
import House from 'lucide-react-native/dist/esm/icons/house'
import ImageIcon from 'lucide-react-native/dist/esm/icons/image'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MessageCircle from 'lucide-react-native/dist/esm/icons/message-circle'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Phone from 'lucide-react-native/dist/esm/icons/phone'
import Star from 'lucide-react-native/dist/esm/icons/star'
import Store from 'lucide-react-native/dist/esm/icons/store'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ScreenHeader } from '../../common/components/screen-header'

type OrderStatus = 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED'
type PickupMode = 'ON_SITE' | 'DELIVERY'
type PaymentMethod = 'FEDAPAY' | 'CASH_ON_DELIVERY' | 'WALLET'

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
  hasReview: boolean
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
  /** Opens (or creates) the buyer <-> courier thread of the delivery. */
  onOpenCourierChat: (deliveryId: string, courierName: string) => void
  onRate: (supplierId: string) => void
}

const STATUS_ORDER: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED']

const STATUS_ICON_SIZE = 20

const STATUS_CONFIG: Record<OrderStatus, { label: string, heroLabel: string }> = {
  PENDING_PAYMENT: { label: 'Paiement en attente de confirmation', heroLabel: 'En attente de paiement' },
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
    case 'PENDING_PAYMENT': return <ClipboardList size={size} color={color} />
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
  onOpenCourierChat,
  onRate,
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
          hasReview: raw.hasReview === true,
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

  // Back from the rating form: the button must reflect the new review.
  useFocusEffect(
    useCallback(() => {
      fetchOrder()
    }, [fetchOrder]),
  )

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
        {/* Live map + courier first: while a run is on, it is what the buyer opens the screen for */}
        {(order.currentStatus === 'IN_DELIVERY' || order.currentStatus === 'DELIVERED') && (
          <DeliveryInfoCard orderId={orderId} isDelivered={isDelivered} onOpenCourierChat={onOpenCourierChat} />
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledBannerText}>Commande annulée</Text>
          </View>
        )}

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

                    <View style={[styles.timelineContent, isLast && styles.timelineContentLast]}>
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
                <View style={styles.confirmedZone}>
                  <View style={styles.confirmedBanner}>
                    <CircleCheck size={18} color={colors.green[800]} />
                    <Text style={styles.confirmedBannerText}>
                      Réception confirmée. Merci !
                    </Text>
                  </View>
                  {!order.hasReview && (
                    <TouchableOpacity
                      style={styles.rateButton}
                      onPress={() => onRate(order.supplierId)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Noter la boutique"
                    >
                      <Star size={16} color={colors.neutral[0]} />
                      <Text style={styles.rateButtonText}>Noter la boutique</Text>
                    </TouchableOpacity>
                  )}
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

  // Section card
  sectionCard: {
    borderRadius: radius.xl,
    padding: spacing[4],
  },
  sectionTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing[2],
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
    minHeight: 40,
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
    minHeight: 10,
    marginVertical: 2,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: spacing[3],
    paddingBottom: spacing[2],
    justifyContent: 'center',
    gap: 2,
  },
  timelineContentLast: {
    paddingBottom: 0,
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
    marginBottom: spacing[2],
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
  confirmedZone: { gap: spacing[2] },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.earth[400],
    borderRadius: radius.pill,
    paddingVertical: spacing[3],
  },
  rateButtonText: { ...typography.h3, color: colors.neutral[0] },
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

interface DeliveryInfo {
  id: string
  status: string
  courier: { name: string, phone: string | null } | null
  courierVehicleType: 'MOTO' | 'BICYCLE' | 'CAR' | 'ON_FOOT' | null
  courierPosition: { latitude: number, longitude: number, updatedAt: string | null } | null
  pickupPosition: { latitude: number, longitude: number } | null
  confirmationCode: string | null
  failReason: string | null
}

const VEHICLE_ICONS = {
  MOTO: Bike,
  BICYCLE: Bike,
  CAR: Car,
  ON_FOOT: Footprints,
} as const

const IN_PROGRESS_STATUSES = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']
/** Courier position refresh cadence while the delivery is on the road. */
const TRACKING_POLL_MS = 10000

function positionAge(updatedAt: string | null): string | null {
  if (!updatedAt) {
    return null
  }
  const minutes = Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000)
  if (minutes < 1) {
    return 'à l\'instant'
  }
  if (minutes < 60) {
    return `il y a ${minutes} min`
  }
  return `il y a ${Math.round(minutes / 60)} h`
}

/** Uber-style live map: courier marker (vehicle icon), shop, and the buyer. */
function DeliveryLiveMap({ info }: { info: DeliveryInfo }) {
  const { semantic } = useTheme()
  const mapRef = useRef<MapView>(null)
  const position = info.courierPosition

  useEffect(() => {
    if (!position) {
      return
    }
    const coords = [{ latitude: position.latitude, longitude: position.longitude }]
    if (info.pickupPosition) {
      coords.push(info.pickupPosition)
    }
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    })
  }, [position, info.pickupPosition])

  if (!position) {
    return null
  }

  const VehicleIcon = info.courierVehicleType ? VEHICLE_ICONS[info.courierVehicleType] : Bike
  const age = positionAge(position.updatedAt)

  return (
    <View style={deliveryStyles.mapWrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: position.latitude,
          longitude: position.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        <Marker
          coordinate={{ latitude: position.latitude, longitude: position.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={deliveryStyles.courierMarker}>
            <VehicleIcon size={18} color={colors.neutral[0]} strokeWidth={2.2} />
          </View>
        </Marker>
        {info.pickupPosition
          ? (
              <Marker
                coordinate={info.pickupPosition}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={[deliveryStyles.shopMarker, { backgroundColor: semantic.bgCard }]}>
                  <Store size={16} color={colors.earth[600]} strokeWidth={2.2} />
                </View>
              </Marker>
            )
          : null}
      </MapView>
      {age
        ? (
            <View style={[deliveryStyles.mapBadge, { backgroundColor: semantic.bgCard }]}>
              <Text style={[deliveryStyles.mapBadgeText, { color: semantic.textSecondary }]}>
                Position
                {' '}
                {age}
              </Text>
            </View>
          )
        : null}
    </View>
  )
}

/**
 * Courier block of the tracking screen: who delivers, and the 4-digit code the
 * buyer hands to the courier as proof of delivery.
 */
function DeliveryInfoCard({ orderId, isDelivered, onOpenCourierChat }: {
  orderId: string
  isDelivered: boolean
  onOpenCourierChat: (deliveryId: string, courierName: string) => void
}) {
  const { semantic } = useTheme()
  const [info, setInfo] = useState<DeliveryInfo | null>(null)
  const inProgress = info ? IN_PROGRESS_STATUSES.includes(info.status) : false

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await apiFetch(`/api/deliveries/by-order/${orderId}`)
        if (res.ok && !cancelled) {
          const data = await res.json() as DeliveryInfo
          setInfo(data)
        }
      }
      catch {
        // The card simply stays hidden / keeps its last state
      }
    }

    load()
    // Live tracking: refresh the courier position while the delivery moves
    const timer = inProgress ? setInterval(load, TRACKING_POLL_MS) : null
    return () => {
      cancelled = true
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [orderId, inProgress])

  if (!info || !info.courier) {
    return null
  }

  return (
    <View style={[deliveryStyles.card, { backgroundColor: semantic.bgCard }, CARD_SHADOW]}>
      {inProgress ? <DeliveryLiveMap info={info} /> : null}
      <Text style={[deliveryStyles.title, { color: semantic.textPrimary }]}>Votre livreur</Text>
      <View style={deliveryStyles.courierRow}>
        <View style={[deliveryStyles.courierAvatar, { backgroundColor: semantic.bgPrimaryLight }]}>
          <Truck size={18} color={colors.green[600]} />
        </View>
        <Text style={[deliveryStyles.courierName, { color: semantic.textPrimary }]}>{info.courier.name}</Text>
        <TouchableOpacity
          style={[deliveryStyles.callButton, { backgroundColor: semantic.bgPrimaryLight }]}
          onPress={() => onOpenCourierChat(info.id, info.courier?.name ?? 'Livreur')}
          accessibilityRole="button"
          accessibilityLabel="Écrire au livreur"
        >
          <MessageCircle size={18} color={colors.green[600]} />
        </TouchableOpacity>
        {info.courier.phone
          ? (
              <TouchableOpacity
                style={[deliveryStyles.callButton, { backgroundColor: semantic.bgPrimaryLight }]}
                onPress={() => {
                  Linking.openURL(`tel:${info.courier?.phone}`)
                }}
                accessibilityRole="button"
                accessibilityLabel="Appeler le livreur"
              >
                <Phone size={18} color={colors.green[600]} />
              </TouchableOpacity>
            )
          : null}
      </View>
      {!isDelivered && info.confirmationCode
        ? (
            <View style={[deliveryStyles.codeBox, { backgroundColor: semantic.bgPrimaryLight }]}>
              <Text style={[deliveryStyles.codeLabel, { color: semantic.textSecondary }]}>
                Code de confirmation à remettre au livreur
              </Text>
              <Text style={[deliveryStyles.codeValue, { color: semantic.textPrimaryColor }]}>
                {info.confirmationCode}
              </Text>
            </View>
          )
        : null}
      {info.status === 'FAILED'
        ? (
            <View style={[deliveryStyles.failBox, { backgroundColor: colors.coral[50] }]}>
              <Text style={[deliveryStyles.failText, { color: colors.coral[800] }]}>
                La livraison n'a pas pu aboutir. Le fournisseur organise une nouvelle tentative.
              </Text>
            </View>
          )
        : null}
    </View>
  )
}

const deliveryStyles = StyleSheet.create({
  // Same footprint as the other section cards: the scroll content already
  // carries the horizontal padding and the vertical gap.
  card: {
    borderRadius: radius.xl,
    padding: spacing[4],
  },
  title: {
    ...typography.h3,
    marginBottom: spacing[3],
  },
  courierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  courierAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courierName: {
    ...typography.bodyL,
    fontFamily: fonts.sansMd,
    flex: 1,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBox: {
    borderRadius: radius.md,
    padding: spacing[4],
    alignItems: 'center',
    marginTop: spacing[3],
  },
  codeLabel: {
    ...typography.caption,
    textAlign: 'center',
  },
  codeValue: {
    fontFamily: fonts.mono,
    fontSize: 32,
    letterSpacing: 10,
    marginTop: spacing[2],
  },
  failBox: {
    borderRadius: radius.md,
    padding: spacing[3],
    marginTop: spacing[3],
  },
  failText: {
    ...typography.bodyS,
  },
  mapWrap: {
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing[3],
  },
  courierMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.neutral[0],
    ...shadows.md,
  },
  shopMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.earth[200],
    ...shadows.sm,
  },
  mapBadge: {
    position: 'absolute',
    bottom: spacing[2],
    left: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
    ...shadows.sm,
  },
  mapBadgeText: {
    ...typography.caption,
  },
})
