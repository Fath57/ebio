import Gift from 'lucide-react-native/dist/esm/icons/gift'
import ImageIcon from 'lucide-react-native/dist/esm/icons/image'
import Store from 'lucide-react-native/dist/esm/icons/store'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'

type ReceivedStatus = 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'IN_DELIVERY' | 'DELIVERED' | 'CANCELLED'

export interface ReceivedLine {
  productId: string
  name: string
  quantity: number
  imageUrl: string | null
}

/** One basket sent by someone else to this account's verified number — never an amount. */
export interface ReceivedOrder {
  orderId: string
  payerFirstName: string
  shopName: string
  supplierId: string | null
  status: ReceivedStatus
  deliveredAt: string | null
  lines: ReceivedLine[]
  canReview: boolean
}

/** Enough for the « Paniers reçus » segment: few people receive more than that. */
const RECEIVED_LIMIT = 50

const STATUS_LABELS: Record<ReceivedStatus, string> = {
  PENDING_PAYMENT: 'En attente de paiement',
  PLACED: 'Commandé',
  ACCEPTED: 'Accepté par la boutique',
  PREPARING: 'En préparation',
  READY: 'Prêt',
  IN_DELIVERY: 'En livraison',
  DELIVERED: 'Livré',
  CANCELLED: 'Annulé',
}

const STATUS_COLORS: Record<ReceivedStatus, { bg: string, text: string }> = {
  PENDING_PAYMENT: { bg: colors.earth[50], text: colors.earth[600] },
  PLACED: { bg: colors.neutral[100], text: colors.neutral[600] },
  ACCEPTED: { bg: colors.blue[50], text: colors.blue[800] },
  PREPARING: { bg: colors.earth[50], text: colors.earth[800] },
  READY: { bg: colors.green[50], text: colors.green[800] },
  IN_DELIVERY: { bg: colors.blue[50], text: colors.blue[600] },
  DELIVERED: { bg: colors.green[100], text: colors.green[600] },
  CANCELLED: { bg: colors.coral[50], text: colors.coral[600] },
}

function toReceivedOrder(raw: Record<string, unknown>): ReceivedOrder {
  const lines = Array.isArray(raw.lines) ? raw.lines as Array<Record<string, unknown>> : []
  return {
    orderId: String(raw.orderId),
    payerFirstName: typeof raw.payerFirstName === 'string' ? raw.payerFirstName : '',
    shopName: typeof raw.shopName === 'string' ? raw.shopName : '',
    supplierId: typeof raw.supplierId === 'string' ? raw.supplierId : null,
    status: (raw.status as ReceivedStatus) ?? 'PLACED',
    deliveredAt: typeof raw.deliveredAt === 'string' ? raw.deliveredAt : null,
    lines: lines.map(line => ({
      productId: String(line.productId),
      name: typeof line.name === 'string' ? line.name : '',
      quantity: Number(line.quantity) || 0,
      imageUrl: typeof line.imageUrl === 'string' ? line.imageUrl : null,
    })),
    canReview: raw.canReview === true,
  }
}

/**
 * The baskets received by this account (`GET /api/orders/received`). Empty
 * for most accounts — the segment only shows when there is at least one.
 */
export function useReceivedOrders() {
  const [items, setItems] = useState<ReceivedOrder[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch(`/api/orders/received?page=1&limit=${RECEIVED_LIMIT}`)
      if (!res.ok)
        return
      const json = await res.json() as Record<string, unknown>
      const raw = Array.isArray(json.items) ? json.items as Array<Record<string, unknown>> : []
      setItems(raw.map(toReceivedOrder))
      setTotal(typeof json.total === 'number' ? json.total : raw.length)
    }
    catch {
      // Offline: the segment simply stays hidden.
    }
    finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { items, total, isLoading, reload }
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

interface ReceivedCardProps {
  order: ReceivedOrder
  expanded: boolean
  onToggle: (orderId: string) => void
  onRateProducts: (orderId: string) => void
  onRateCourier: (orderId: string, supplierId: string | null) => void
}

/** A received basket: who sent it, from which shop, and — opened — every line. */
function ReceivedCard({ order, expanded, onToggle, onRateProducts, onRateCourier }: ReceivedCardProps) {
  const { semantic } = useTheme()
  const statusColor = STATUS_COLORS[order.status]
  const firstImage = order.lines.find(line => line.imageUrl)?.imageUrl ?? null
  const sender = order.payerFirstName || 'Un proche'

  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
      <Pressable
        style={styles.cardRow}
        onPress={() => onToggle(order.orderId)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Panier envoyé par ${sender}, ${STATUS_LABELS[order.status]}`}
      >
        <View style={[styles.thumbnail, { backgroundColor: semantic.bgSurface }]}>
          {firstImage
            ? <Image source={{ uri: firstImage }} style={styles.thumbnailImage} resizeMode="contain" />
            : <ImageIcon size={24} color={semantic.textTertiary} />}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.senderRow}>
            <Gift size={14} color={colors.green[600]} strokeWidth={2.2} />
            <Text style={[styles.sender, { color: semantic.textPrimary }]} numberOfLines={1}>
              {`De la part de ${sender}`}
            </Text>
          </View>
          <View style={styles.shopRow}>
            <Store size={13} color={semantic.textSecondary} />
            <Text style={[styles.shopName, { color: semantic.textSecondary }]} numberOfLines={1}>
              {order.shopName}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.statusText, { color: statusColor.text }]}>{STATUS_LABELS[order.status]}</Text>
            </View>
            {order.deliveredAt && (
              <Text style={[styles.date, { color: semantic.textTertiary }]}>{formatDay(order.deliveredAt)}</Text>
            )}
          </View>
        </View>
      </Pressable>

      {expanded && (
        <View style={[styles.details, { borderTopColor: semantic.borderLight }]}>
          {order.lines.map(line => (
            <View key={line.productId} style={styles.line}>
              <View style={[styles.lineImage, { backgroundColor: semantic.bgSurface }]}>
                {line.imageUrl
                  ? <Image source={{ uri: line.imageUrl }} style={styles.lineImage} resizeMode="contain" accessibilityLabel={`Photo de ${line.name}`} />
                  : <ImageIcon size={16} color={semantic.textTertiary} />}
              </View>
              <Text style={[styles.lineText, { color: semantic.textPrimary }]} numberOfLines={2}>
                {`${line.quantity} × ${line.name}`}
              </Text>
            </View>
          ))}
          {order.canReview && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => onRateProducts(order.orderId)}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>Noter les produits</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: semantic.borderNormal }]}
                onPress={() => onRateCourier(order.orderId, order.supplierId)}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: semantic.textPrimary }]}>{order.supplierId ? 'Noter la boutique et le livreur' : 'Noter le livreur'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

interface ReceivedOrdersProps {
  items: ReceivedOrder[]
  isRefreshing: boolean
  onRefresh: () => void
  onRateProducts: (orderId: string) => void
  onRateCourier: (orderId: string, supplierId: string | null) => void
  bottomInset: number
}

/**
 * « Paniers reçus » : what someone ordered for this account. No amount, no
 * cancellation — only the progress, the contents and, once delivered, the
 * rating.
 */
export function ReceivedOrders({ items, isRefreshing, onRefresh, onRateProducts, onRateCourier, bottomInset }: ReceivedOrdersProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleToggle = useCallback((orderId: string) => {
    setExpandedId(current => (current === orderId ? null : orderId))
  }, [])

  const renderItem = useCallback(({ item }: { item: ReceivedOrder }) => (
    <ReceivedCard
      order={item}
      expanded={expandedId === item.orderId}
      onToggle={handleToggle}
      onRateProducts={onRateProducts}
      onRateCourier={onRateCourier}
    />
  ), [expandedId, handleToggle, onRateProducts, onRateCourier])

  return (
    <FlatList
      data={items}
      renderItem={renderItem}
      keyExtractor={item => item.orderId}
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset }]}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    gap: spacing[3],
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing[3],
    ...shadows.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 60,
  },
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
  cardContent: {
    flex: 1,
    gap: spacing[1],
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  sender: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
    flexShrink: 1,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  shopName: {
    ...typography.caption,
    flexShrink: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  statusText: {
    ...typography.caption,
    fontFamily: fonts.sansSb,
  },
  date: {
    ...typography.caption,
  },
  details: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    gap: spacing[2],
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  lineImage: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lineText: {
    ...typography.bodyS,
    flex: 1,
  },
  actions: {
    marginTop: spacing[2],
    gap: spacing[2],
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
    color: colors.neutral[0],
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
  },
})
