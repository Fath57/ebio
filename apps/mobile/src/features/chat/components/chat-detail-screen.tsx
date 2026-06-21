import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Package from 'lucide-react-native/dist/esm/icons/package'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ChatScreen } from './chat-screen'

interface ChatDetailScreenProps {
  conversationId: string
  currentUserId: string
  peerName?: string
  isSupplier?: boolean
  orderId?: string | null
  onGoBack: () => void
  onOpenOrder?: (orderId: string) => void
}

export function ChatDetailScreen({ conversationId, currentUserId, peerName, isSupplier = false, orderId, onGoBack, onOpenOrder }: ChatDetailScreenProps) {
  const { semantic } = useTheme()
  const [orderNumber, setOrderNumber] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId)
      return
    let cancelled = false
    apiFetch(`/api/orders/${orderId}`)
      .then(res => (res.ok ? res.json() : null))
      .then((o) => {
        if (!cancelled && o)
          setOrderNumber((o.orderNumber as string) ?? null)
      })
      .catch(() => { /* ignore */ })
    return () => {
      cancelled = true
    }
  }, [orderId])

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <View style={[styles.header, { backgroundColor: semantic.bgCard, borderBottomColor: semantic.borderLight }]}>
        <TouchableOpacity onPress={onGoBack} hitSlop={8}>
          <ArrowLeft size={24} color={semantic.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: semantic.textPrimary }]} numberOfLines={1}>
          {peerName ?? 'Conversation'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

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
  title: { ...typography.h3, flex: 1, textAlign: 'center' },
  orderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  orderBannerText: { ...typography.bodyS, fontFamily: fonts.sansSb, flex: 1 },
})
