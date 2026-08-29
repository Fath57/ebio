import type { ConversationKind } from '../delivery-chat'
import { useFocusEffect } from '@react-navigation/native'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import UserIcon from 'lucide-react-native/dist/esm/icons/user'
import * as React from 'react'
import { useCallback, useState } from 'react'
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { chatFetch } from '../../../utils/api-client'
import { ScreenHeader } from '../../common/components/screen-header'

interface Conversation {
  id: string
  participantName: string
  participantAvatar: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
  isSupplier: boolean
  orderId: string | null
  kind: ConversationKind
  orderNumber: string | null
  /** Role label of the peer on courier threads (« Livreur » for the buyer, « Client » for the courier). */
  peerRole: 'Livreur' | 'Client' | null
}

interface ConversationListProps {
  currentUserId: string
  onOpenConversation: (
    conversationId: string,
    participantName: string,
    isSupplier: boolean,
    orderId: string | null,
    kind: ConversationKind,
  ) => void
}

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMin = Math.floor((now - then) / 60000)

  if (diffMin < 1)
    return 'à l\u2019instant'
  if (diffMin < 60)
    return `${diffMin} min`

  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)
    return `${diffH}h`

  const diffD = Math.floor(diffH / 24)
  if (diffD < 7)
    return `${diffD}j`

  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

/** Aperçu typé du dernier message (📷 / 🎤 / 📍 au lieu de « [média] »). */
function formatPreview(last: { content?: string | null, type?: string } | null): string | null {
  if (!last)
    return null
  if (last.type === 'PHOTO' || last.type === 'IMAGE')
    return '📷 Photo'
  if (last.type === 'VOICE')
    return '🎤 Note vocale'
  if (last.type === 'LOCATION')
    return '📍 Position'
  return last.content ?? null
}

export function ConversationList({ currentUserId, onOpenConversation }: ConversationListProps) {
  const { semantic } = useTheme()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await chatFetch('/api/chat/conversations')
      if (res.ok) {
        const raw = await res.json() as Array<Record<string, unknown>>
        const mapped: Conversation[] = raw.map((c) => {
          const isBuyer = currentUserId === (c.buyerId as string)
          const last = c.lastMessage as { content?: string | null, type?: string, senderId?: string } | null
          const preview = formatPreview(last)
          const isOwnLast = last?.senderId != null && last.senderId === currentUserId
          const kind: ConversationKind = c.kind === 'COURIER' ? 'COURIER' : 'SUPPLIER'
          // Server-computed peer fields take precedence; the buyer/supplier
          // heuristics remain as a fallback for older payloads.
          const peerName = typeof c.peerName === 'string' ? c.peerName : null
          const peerImage = typeof c.peerImage === 'string' ? c.peerImage : null
          const fallbackName = (isBuyer ? c.supplierShopName : c.buyerName) as string | null
          const fallbackImage = (isBuyer ? c.supplierProfilePhoto : c.buyerImage) as string | null
          let peerRole: Conversation['peerRole'] = null
          if (kind === 'COURIER') {
            peerRole = isBuyer ? 'Livreur' : 'Client'
          }
          return {
            id: c.id as string,
            participantName: peerName ?? fallbackName ?? '',
            participantAvatar: peerImage ?? fallbackImage ?? null,
            lastMessage: preview != null && isOwnLast ? `Vous : ${preview}` : preview,
            lastMessageAt: (c.lastMessageAt as string) ?? null,
            unreadCount: (c.unreadCount as number) ?? 0,
            isSupplier: !isBuyer,
            orderId: (c.orderId as string) ?? null,
            kind,
            orderNumber: typeof c.orderNumber === 'string' ? c.orderNumber : null,
            peerRole,
          }
        })
        const sorted = mapped.sort((a, b) => {
          if (!a.lastMessageAt)
            return 1
          if (!b.lastMessageAt)
            return -1
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
        })
        setConversations(sorted)
      }
    }
    catch {
      // Silently fail
    }
    finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [currentUserId])

  // Refresh whenever the screen (re)gains focus — new messages while away
  useFocusEffect(useCallback(() => {
    void fetchConversations()
  }, [fetchConversations]))

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    fetchConversations()
  }, [fetchConversations])

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() => onOpenConversation(item.id, item.participantName, item.isSupplier, item.orderId, item.kind)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Conversation avec ${item.participantName}`}
      >
        {item.participantAvatar
          ? (
              <Image
                source={{ uri: item.participantAvatar }}
                style={styles.avatar}
                resizeMode="cover"
              />
            )
          : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {item.participantName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={[styles.name, { color: semantic.textPrimary }]} numberOfLines={1}>
              {item.participantName}
            </Text>
            {item.peerRole && (
              <View style={[styles.roleBadge, { backgroundColor: semantic.bgPrimaryLight }]}>
                {item.peerRole === 'Livreur'
                  ? <Bike size={12} color={colors.green[600]} strokeWidth={2.2} />
                  : <UserIcon size={12} color={colors.green[600]} strokeWidth={2.2} />}
                <Text style={styles.roleBadgeText}>{item.peerRole}</Text>
              </View>
            )}
            {item.lastMessageAt && (
              <Text style={[styles.time, { color: semantic.textTertiary }]}>
                {formatRelativeTime(item.lastMessageAt)}
              </Text>
            )}
          </View>
          {item.orderNumber && (
            <Text style={[styles.orderNumber, { color: semantic.textSecondary }]} numberOfLines={1}>
              {`Commande ${item.orderNumber}`}
            </Text>
          )}
          <View style={styles.bottomRow}>
            <Text style={[styles.preview, { color: semantic.textTertiary }]} numberOfLines={1}>
              {item.lastMessage ?? 'Aucun message'}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    ),
    [onOpenConversation, semantic],
  )

  const keyExtractor = useCallback((item: Conversation) => item.id, [])

  // Racine d'onglet : en-tête sans bouton retour, seulement le repère « où suis-je ».
  // FlatList même à vide : le pull-to-refresh doit rester disponible.
  return (
    <View style={[styles.list, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Messages" />
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={[styles.list, { backgroundColor: semantic.bgPage }]}
        contentContainerStyle={[styles.listContent, conversations.length === 0 && styles.listContentEmpty]}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={(
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>
              {isLoading ? 'Chargement…' : 'Aucune conversation'}
            </Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  listContent: {
    paddingVertical: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 44,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: colors.green[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
    color: colors.green[600],
  },
  content: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
    color: colors.neutral[800],
    flex: 1,
  },
  time: {
    ...typography.caption,
    color: colors.neutral[400],
    marginLeft: spacing[2],
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginLeft: spacing[2],
  },
  roleBadgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    color: colors.green[600],
  },
  orderNumber: {
    ...typography.caption,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preview: {
    ...typography.bodyS,
    color: colors.neutral[400],
    flex: 1,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[1],
    marginLeft: spacing[2],
  },
  unreadText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    color: colors.neutral[0],
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing[8],
  },
  emptyText: {
    ...typography.bodyL,
    color: colors.neutral[400],
  },
})
