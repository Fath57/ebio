import type { ConversationKind } from '../delivery-chat'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Package from 'lucide-react-native/dist/esm/icons/package'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { APP_VARIANT } from '../../../utils/app-variant'
import { ScreenHeader } from '../../common/components/screen-header'
import { ChatScreen } from './chat-screen'

interface ChatDetailScreenProps {
  conversationId: string
  currentUserId: string
  peerName?: string
  isSupplier?: boolean
  orderId?: string | null
  /** SUPPLIER (buyer <-> shop, default) or COURIER (buyer <-> courier of a delivery). */
  kind?: ConversationKind
  /** Known order number: skips the order lookup (couriers cannot read /api/orders). */
  orderNumber?: string | null
  onGoBack: () => void
  onOpenOrder?: (orderId: string) => void
}

/** One-tap messages for a courier on the road — sent as-is. */
const COURIER_QUICK_REPLIES = [
  'Je suis en route vers vous 🛵',
  'J’arrive dans 5 minutes',
  'Je suis devant chez vous',
  'Petit retard, j’arrive dans 10 minutes',
  'Je ne trouve pas l’adresse, pouvez-vous m’indiquer un repère ?',
  'Pouvez-vous me rappeler ?',
]

export function ChatDetailScreen({
  conversationId,
  currentUserId,
  peerName,
  isSupplier = false,
  orderId,
  kind = 'SUPPLIER',
  orderNumber: knownOrderNumber = null,
  onGoBack,
  onOpenOrder,
}: ChatDetailScreenProps) {
  const { semantic } = useTheme()
  const [fetchedOrderNumber, setFetchedOrderNumber] = useState<string | null>(null)
  const orderNumber = knownOrderNumber ?? fetchedOrderNumber
  const isCourierThread = kind === 'COURIER'
  // Courier threads: the peer is the courier for the buyer, the buyer for the courier.
  let subtitle: string | undefined
  if (isCourierThread) {
    subtitle = APP_VARIANT === 'courier' ? 'Client' : 'Livreur'
  }

  useEffect(() => {
    if (!orderId || knownOrderNumber)
      return
    let cancelled = false
    apiFetch(`/api/orders/${orderId}`)
      .then(res => (res.ok ? res.json() : null))
      .then((o) => {
        if (!cancelled && o)
          setFetchedOrderNumber((o.orderNumber as string) ?? null)
      })
      .catch(() => { /* ignore */ })
    return () => {
      cancelled = true
    }
  }, [orderId, knownOrderNumber])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title={peerName ?? 'Conversation'}
        subtitle={subtitle}
        onBack={onGoBack}
        leadingSlot={(
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{(peerName ?? 'C').charAt(0).toUpperCase()}</Text>
          </View>
        )}
      />

      {/* Bannière de contexte commande */}
      {orderId != null && orderId !== '' && (
        <TouchableOpacity
          style={[styles.orderBanner, { backgroundColor: colors.earth[50] }]}
          onPress={() => onOpenOrder?.(orderId)}
          activeOpacity={0.7}
          disabled={!onOpenOrder}
        >
          <Package size={16} color={colors.earth[600]} />
          <Text style={[styles.orderBannerText, { color: colors.earth[800] }]} numberOfLines={1}>
            Commande
            {' '}
            {orderNumber ?? '…'}
          </Text>
          {onOpenOrder && <ChevronRight size={16} color={colors.earth[600]} />}
        </TouchableOpacity>
      )}

      <ChatScreen
        conversationId={conversationId}
        currentUserId={currentUserId}
        isSupplier={isSupplier}
        quickReplies={APP_VARIANT === 'courier' && kind === 'COURIER' ? COURIER_QUICK_REPLIES : undefined}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { fontFamily: fonts.sansBd, fontSize: 16, color: colors.green[600] },
  title: { ...typography.h3, flex: 1 },
  orderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  orderBannerText: { ...typography.bodyS, fontFamily: fonts.sansSb, flex: 1 },
})
