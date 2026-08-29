import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'

interface OrderItem {
  productName: string
  productPhoto: string | null
  variantLabel: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface OrderDetail {
  orderNumber: string
  buyerName: string
  status: string
  pickupMode: string
  paymentMethod: string
  deliveryAddress: string | null
  deliverySlot: string | null
  totalAmount: number
  commissionAmount: number
  deliveryFee: number
  discountAmount: number
  items: OrderItem[]
  createdAt: string
  acceptedAt: string | null
  deliveredAt: string | null
}

interface OrderDetailScreenProps {
  orderId: string
  onGoBack: () => void
}

const REJECT_REASONS = ['Rupture de stock', 'Boutique fermée', 'Zone non desservie', 'Autre'] as const

const STATUS_LABELS: Record<string, string> = {
  PLACED: 'Nouvelle',
  ACCEPTED: 'Acceptée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  IN_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  DISPUTED: 'Litige',
}

const PICKUP_LABELS: Record<string, string> = {
  ON_SITE: 'Retrait sur place',
  DELIVERY: 'Livraison',
}

const PAYMENT_LABELS: Record<string, string> = {
  FEDAPAY: 'Mobile Money',
  CASH_ON_DELIVERY: 'Paiement à la livraison',
}

function formatPrice(n: number): string {
  return n.toLocaleString('fr-FR').replace(/,/g, ' ')
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  catch {
    return ''
  }
}

interface ActionButtonProps {
  label: string
  onPress: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}

function ActionButton({ label, onPress, disabled = false, variant = 'primary' }: ActionButtonProps) {
  const { semantic } = useTheme()
  const background = variant === 'primary' ? colors.green[400] : variant === 'danger' ? colors.coral[50] : semantic.bgCard
  const border = variant === 'danger' ? colors.coral[200] : variant === 'secondary' ? semantic.borderNormal : colors.green[400]
  const color = variant === 'primary' ? colors.neutral[0] : variant === 'danger' ? colors.coral[600] : semantic.textPrimary
  return (
    <Pressable
      style={[styles.actionButton, { backgroundColor: background, borderColor: border }, disabled && styles.actionDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  )
}

export function OrderDetailScreen({ orderId, onGoBack }: OrderDetailScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [acting, setActing] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}`)
      if (res.ok) {
        const o = await res.json() as Record<string, unknown>
        setOrder({
          orderNumber: (o.orderNumber as string) ?? '',
          buyerName: (o.buyerName as string) ?? '',
          status: (o.status as string) ?? '',
          pickupMode: (o.pickupMode as string) ?? '',
          paymentMethod: (o.paymentMethod as string) ?? '',
          deliveryAddress: (o.deliveryAddress as string) ?? null,
          deliverySlot: (o.deliverySlot as string) ?? null,
          totalAmount: (o.totalAmount as number) ?? 0,
          commissionAmount: (o.commissionAmount as number) ?? 0,
          deliveryFee: (o.deliveryFee as number) ?? 0,
          discountAmount: (o.discountAmount as number) ?? 0,
          items: ((o.items as Array<Record<string, unknown>>) ?? []).map(it => ({
            productName: (it.productName as string) ?? '',
            productPhoto: (it.productThumbnail as string | null) ?? (it.productPhoto as string | null) ?? null,
            variantLabel: (it.variantLabel as string) ?? null,
            quantity: (it.quantity as number) ?? 0,
            unitPrice: (it.unitPrice as number) ?? 0,
            totalPrice: (it.totalPrice as number) ?? 0,
          })),
          createdAt: (o.createdAt as string) ?? '',
          acceptedAt: (o.acceptedAt as string) ?? null,
          deliveredAt: (o.deliveredAt as string) ?? null,
        })
      }
    }
    catch {
      // ignore
    }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  /** Runs one status transition then reloads the order and its course. */
  const transition = useCallback(async (path: string, body?: Record<string, unknown>, failure = 'Impossible de mettre à jour la commande.'): Promise<void> => {
    setActing(true)
    try {
      const res = await apiFetch(`/api/orders/${orderId}/${path}`, {
        method: 'PATCH',
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string, aggregateErrors?: { message?: string }[] }
        appAlert('Erreur', data.aggregateErrors?.[0]?.message ?? data.message ?? failure)
        return
      }
      await load()
      setRefreshToken(t => t + 1)
    }
    catch {
      appAlert('Erreur', failure)
    }
    finally {
      setActing(false)
    }
  }, [orderId, load])

  function askRejectReason(): void {
    appAlert('Refuser la commande', 'Indiquez le motif communiqué au client.', [
      ...REJECT_REASONS.map(reason => ({ text: reason, onPress: () => { void transition('reject', { reason }, 'Impossible de refuser la commande.') } })),
      { text: 'Annuler', style: 'cancel' as const },
    ])
  }

  function confirmSelfDelivery(): void {
    appAlert('Livrer moi-même', 'La recherche de livreur eBio sera annulée et vous assurez la livraison.', [
      { text: 'Je livre moi-même', onPress: () => { void transition('status', { status: 'IN_DELIVERY' }) } },
      { text: 'Annuler', style: 'cancel' as const },
    ])
  }

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    setRefreshToken(t => t + 1)
    load()
  }, [load])

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>Commande introuvable</Text>
      </View>
    )
  }

  const subtotal = order.items.reduce((s, it) => s + it.totalPrice, 0)

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title={`Commande ${order.orderNumber}`} onBack={onGoBack} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.green[400]}
            colors={[colors.green[400]]}
          />
        )}
      >
        <View style={styles.badgeRow}>
          <Text style={styles.statusBadge}>{STATUS_LABELS[order.status] ?? order.status}</Text>
          <Text style={[styles.date, { color: semantic.textTertiary }]}>{formatDate(order.createdAt)}</Text>
        </View>

        <Text style={[styles.buyerName, { color: semantic.textPrimary }]}>{order.buyerName}</Text>

        {/* Status transitions — same rules as the orders list */}
        <View style={styles.actionBar}>
          {order.status === 'PLACED' && (
            <>
              <ActionButton label="Accepter" onPress={() => { void transition('accept', undefined, 'Impossible d’accepter la commande.') }} disabled={acting} />
              <ActionButton label="Refuser" onPress={askRejectReason} disabled={acting} variant="danger" />
            </>
          )}
          {order.status === 'ACCEPTED' && (
            <ActionButton label="Passer en préparation" onPress={() => { void transition('status', { status: 'PREPARING' }) }} disabled={acting} />
          )}
          {order.status === 'PREPARING' && (
            <ActionButton label="Marquer comme prête" onPress={() => { void transition('status', { status: 'READY' }) }} disabled={acting} />
          )}
          {order.status === 'READY' && order.pickupMode === 'ON_SITE' && (
            <ActionButton label="Remise au client — livrée" onPress={() => { void transition('confirm-delivery', undefined, 'Impossible de confirmer la remise.') }} disabled={acting} />
          )}
          {order.status === 'READY' && order.pickupMode === 'DELIVERY' && (
            <ActionButton label="Je livre moi-même" onPress={confirmSelfDelivery} disabled={acting} variant="secondary" />
          )}
          {order.status === 'IN_DELIVERY' && (
            <ActionButton label="Marquer comme livrée" onPress={() => { void transition('confirm-delivery', undefined, 'Impossible de confirmer la livraison.') }} disabled={acting} variant="secondary" />
          )}
        </View>

        {/* Items */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>ARTICLES</Text>
        <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
          {order.items.map((it, i) => (
            <View key={`${it.productName}-${i}`} style={[styles.itemRow, i > 0 && { borderTopColor: semantic.borderLight, borderTopWidth: 1 }]}>
              {it.productPhoto
                ? <Image source={{ uri: it.productPhoto }} style={styles.itemImage} resizeMode="cover" />
                : (
                    <View style={[styles.itemImage, styles.itemImagePlaceholder, { backgroundColor: semantic.bgSurface }]}>
                      <Text style={[styles.itemImageLetter, { color: semantic.textTertiary }]}>{it.productName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: semantic.textPrimary }]}>{it.productName}</Text>
                <Text style={[styles.itemMeta, { color: semantic.textTertiary }]}>
                  {it.variantLabel ? `${it.variantLabel} · ` : ''}
                  {it.quantity}
                  {' × '}
                  {formatPrice(it.unitPrice)}
                  {' F'}
                </Text>
              </View>
              <Text style={[styles.itemTotal, { color: semantic.textPrimary }]}>
                {formatPrice(it.totalPrice)}
                {' F'}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: semantic.textSecondary }]}>Sous-total</Text>
            <Text style={[styles.totalValue, { color: semantic.textPrimary }]}>
              {formatPrice(subtotal)}
              {' F'}
            </Text>
          </View>
          {order.deliveryFee > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: semantic.textSecondary }]}>Frais de livraison</Text>
              <Text style={[styles.totalValue, { color: semantic.textPrimary }]}>
                {formatPrice(order.deliveryFee)}
                {' F'}
              </Text>
            </View>
          )}
          {order.discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: semantic.textSecondary }]}>Remise</Text>
              <Text style={[styles.totalValue, { color: colors.green[600] }]}>
                {'- '}
                {formatPrice(order.discountAmount)}
                {' F'}
              </Text>
            </View>
          )}
          {order.commissionAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: semantic.textSecondary }]}>Commission</Text>
              <Text style={[styles.totalValue, { color: colors.coral[600] }]}>
                {'- '}
                {formatPrice(order.commissionAmount)}
                {' F'}
              </Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.totalRowFinal, { borderTopColor: semantic.borderLight }]}>
            <Text style={[styles.totalLabelFinal, { color: semantic.textPrimary }]}>Total</Text>
            <Text style={[styles.totalValueFinal, { color: colors.green[600] }]}>
              {formatPrice(order.totalAmount)}
              {' FCFA'}
            </Text>
          </View>
        </View>

        {/* Delivery & payment */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>LIVRAISON & PAIEMENT</Text>
        <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
          <InfoRow label="Mode" value={PICKUP_LABELS[order.pickupMode] ?? order.pickupMode} semantic={semantic} />
          {order.deliveryAddress != null && order.deliveryAddress !== '' && (
            <InfoRow label="Adresse" value={order.deliveryAddress} semantic={semantic} />
          )}
          {order.deliverySlot != null && order.deliverySlot !== '' && (
            <InfoRow label="Créneau" value={order.deliverySlot} semantic={semantic} />
          )}
          <InfoRow label="Paiement" value={PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod} semantic={semantic} />
        </View>

        {/* Timeline */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>HISTORIQUE</Text>
        <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
          <InfoRow label="Commande passée" value={formatDate(order.createdAt)} semantic={semantic} />
          {order.acceptedAt != null && order.acceptedAt !== '' && (
            <InfoRow label="Acceptée" value={formatDate(order.acceptedAt)} semantic={semantic} />
          )}
          {order.deliveredAt != null && order.deliveredAt !== '' && (
            <InfoRow label="Livrée" value={formatDate(order.deliveredAt)} semantic={semantic} />
          )}
        </View>

        {/* Course (courier delivery) — only meaningful once the order is READY */}
        {order.pickupMode === 'DELIVERY' && ['READY', 'IN_DELIVERY', 'DELIVERED'].includes(order.status) && (
          <CourseSection orderId={orderId} refreshToken={refreshToken} />
        )}
      </ScrollView>
    </View>
  )
}

interface CourseInfo {
  id: string
  status: string
  courier: { name: string, phone: string | null } | null
  failReason: string | null
  failComment: string | null
  events: Array<{ type: string, occurredAt: string }>
}

const COURSE_STATUS_LABELS: Record<string, string> = {
  AWAITING_COURIER: 'En attente de livreur',
  ACCEPTED: 'Livreur en route vers la boutique',
  PICKED_UP: 'Commande récupérée',
  IN_TRANSIT: 'En livraison',
  DELIVERED: 'Livrée',
  FAILED: 'Échec de livraison',
  CANCELLED: 'Course annulée',
}

const COURSE_FAIL_LABELS: Record<string, string> = {
  CUSTOMER_ABSENT: 'Client absent',
  ADDRESS_NOT_FOUND: 'Adresse introuvable',
  CUSTOMER_REFUSED: 'Refus du client',
  OTHER: 'Autre motif',
}

/** Delivery tracking block for the supplier: assigned courier + rebroadcast. */
function CourseSection({ orderId, refreshToken }: { orderId: string, refreshToken: number }) {
  const { semantic } = useTheme()
  const [course, setCourse] = useState<CourseInfo | null>(null)
  const [rebroadcasting, setRebroadcasting] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/deliveries/by-order/${orderId}`)
      if (res.ok) {
        setCourse(await res.json() as CourseInfo)
      }
    }
    catch {
      // ignore — the block simply stays hidden
    }
  }, [orderId])

  // refreshToken bumps on pull-to-refresh so the course reloads too.
  useEffect(() => {
    load()
  }, [load, refreshToken])

  if (!course) {
    return null
  }

  async function rebroadcast() {
    if (!course) {
      return
    }
    setRebroadcasting(true)
    try {
      const res = await apiFetch(`/api/deliveries/${course.id}/rebroadcast`, { method: 'POST' })
      if (res.ok) {
        appAlert('Recherche relancée', 'La course a été proposée à nouveau aux livreurs, sur un rayon élargi.')
        await load()
      }
      else if (res.status === 409) {
        appAlert('Livreur trouvé', 'Un livreur a déjà pris cette course en charge.')
        await load()
      }
      else {
        appAlert('Erreur', 'La relance a échoué. Réessayez.')
      }
    }
    catch {
      appAlert('Hors connexion', 'Vérifiez votre connexion internet puis réessayez.')
    }
    finally {
      setRebroadcasting(false)
    }
  }

  const isFailed = course.status === 'FAILED'

  return (
    <>
      <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>COURSE</Text>
      <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
        <InfoRow
          label="Statut"
          value={COURSE_STATUS_LABELS[course.status] ?? course.status}
          semantic={semantic}
        />
        {course.courier && (
          <InfoRow label="Livreur" value={`${course.courier.name}${course.courier.phone ? ` · ${course.courier.phone}` : ''}`} semantic={semantic} />
        )}
        {isFailed && course.failReason && (
          <InfoRow
            label="Échec"
            value={`${COURSE_FAIL_LABELS[course.failReason] ?? course.failReason}${course.failComment ? ` — ${course.failComment}` : ''}`}
            semantic={semantic}
          />
        )}
        {course.status === 'AWAITING_COURIER' && (
          <Pressable
            style={[styles.rebroadcastButton, rebroadcasting && styles.rebroadcastDisabled]}
            onPress={rebroadcast}
            disabled={rebroadcasting}
            accessibilityRole="button"
            accessibilityLabel="Relancer la recherche de livreur"
          >
            {rebroadcasting
              ? <ActivityIndicator size="small" color={colors.neutral[0]} />
              : <Text style={styles.rebroadcastText}>Relancer la recherche de livreur</Text>}
          </Pressable>
        )}
      </View>
    </>
  )
}

function InfoRow({ label, value, semantic }: { label: string, value: string, semantic: { textSecondary: string, textPrimary: string } }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: semantic.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: semantic.textPrimary }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { ...typography.bodyL },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  headerTitle: { ...typography.h3, fontFamily: fonts.mono, flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: spacing[4], gap: spacing[2] },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: {
    ...typography.caption,
    fontFamily: fonts.sansSb,
    color: colors.green[800],
    backgroundColor: colors.green[50],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  date: { ...typography.caption },
  buyerName: { ...typography.h2, marginTop: spacing[1] },
  sectionTitle: { ...typography.overline, marginTop: spacing[4], marginBottom: spacing[1] },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImageLetter: { ...typography.bodyL, fontFamily: fonts.sansBd },
  itemInfo: { flex: 1 },
  itemName: { ...typography.bodyL, fontFamily: fonts.sansMd },
  itemMeta: { ...typography.caption, marginTop: 2 },
  itemTotal: { ...typography.bodyL, fontFamily: fonts.sansSb },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
  },
  totalLabel: { ...typography.bodyS },
  totalValue: { ...typography.bodyS, fontFamily: fonts.sansSb },
  totalRowFinal: { borderTopWidth: 1, marginTop: spacing[1], paddingTop: spacing[3] },
  totalLabelFinal: { ...typography.h3 },
  totalValueFinal: { ...typography.price },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  infoLabel: { ...typography.bodyS },
  infoValue: { ...typography.bodyS, fontFamily: fonts.sansMd, flexShrink: 1, textAlign: 'right' },
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  actionButton: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  actionDisabled: { opacity: 0.6 },
  actionText: {
    ...typography.caption,
    fontSize: 13,
  },
  rebroadcastButton: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing[3],
  },
  rebroadcastDisabled: { opacity: 0.6 },
  rebroadcastText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
})
