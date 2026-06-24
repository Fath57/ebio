import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ScreenHeader } from '../../common/components/screen-header'

interface OrderItem {
  productName: string
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
  items: OrderItem[]
  createdAt: string
}

interface OrderDetailScreenProps {
  orderId: string
  onGoBack: () => void
}

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

export function OrderDetailScreen({ orderId, onGoBack }: OrderDetailScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const res = await apiFetch(`/api/orders/${orderId}`)
        if (res.ok) {
          const o = await res.json() as Record<string, unknown>
          if (cancelled)
            return
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
            items: ((o.items as Array<Record<string, unknown>>) ?? []).map(it => ({
              productName: (it.productName as string) ?? '',
              variantLabel: (it.variantLabel as string) ?? null,
              quantity: (it.quantity as number) ?? 0,
              unitPrice: (it.unitPrice as number) ?? 0,
              totalPrice: (it.totalPrice as number) ?? 0,
            })),
            createdAt: (o.createdAt as string) ?? '',
          })
        }
      }
      catch {
        // ignore
      }
      finally {
        if (!cancelled)
          setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orderId])

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
      >
        <View style={styles.badgeRow}>
          <Text style={styles.statusBadge}>{STATUS_LABELS[order.status] ?? order.status}</Text>
          <Text style={[styles.date, { color: semantic.textTertiary }]}>{formatDate(order.createdAt)}</Text>
        </View>

        <Text style={[styles.buyerName, { color: semantic.textPrimary }]}>{order.buyerName}</Text>

        {/* Items */}
        <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>ARTICLES</Text>
        <View style={[styles.card, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
          {order.items.map((it, i) => (
            <View key={`${it.productName}-${i}`} style={[styles.itemRow, i > 0 && { borderTopColor: semantic.borderLight, borderTopWidth: 1 }]}>
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
      </ScrollView>
    </View>
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
})
