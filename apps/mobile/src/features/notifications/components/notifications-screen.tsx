import BellOff from 'lucide-react-native/dist/esm/icons/bell-off'
import CheckCheck from 'lucide-react-native/dist/esm/icons/check-check'
import ChevronLeft from 'lucide-react-native/dist/esm/icons/chevron-left'
import CreditCardIcon from 'lucide-react-native/dist/esm/icons/credit-card'
import MessageCircleIcon from 'lucide-react-native/dist/esm/icons/message-circle'
import PackageIcon from 'lucide-react-native/dist/esm/icons/package'
import ShieldAlertIcon from 'lucide-react-native/dist/esm/icons/shield-alert'
import StarIcon from 'lucide-react-native/dist/esm/icons/star'
import TrendingDownIcon from 'lucide-react-native/dist/esm/icons/trending-down'
import * as React from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { StaggerItem } from '../../../utils/animations'
import { apiFetch } from '../../../utils/api-client'

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown> | null
  channel: string
  readAt: string | null
  createdAt: string
}

interface NotificationsScreenProps {
  onGoBack: () => void
}

const TYPE_ICONS: Record<string, typeof PackageIcon> = {
  ORDER_PLACED: PackageIcon,
  ORDER_ACCEPTED: PackageIcon,
  ORDER_REJECTED: PackageIcon,
  ORDER_READY: PackageIcon,
  ORDER_DELIVERED: PackageIcon,
  ORDER_CANCELLED: PackageIcon,
  PAYMENT_RECEIVED: CreditCardIcon,
  PAYMENT_RELEASED: CreditCardIcon,
  NEW_MESSAGE: MessageCircleIcon,
  NEW_REVIEW: StarIcon,
  STOCK_ALERT: TrendingDownIcon,
  SUPPLIER_VALIDATED: ShieldAlertIcon,
  SUPPLIER_REJECTED: ShieldAlertIcon,
  DISPUTE_OPENED: ShieldAlertIcon,
  DISPUTE_RESOLVED: ShieldAlertIcon,
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 1)
    return 'À l\'instant'
  if (diffMin < 60)
    return `${diffMin} min`
  if (diffHours < 24)
    return `${diffHours} h`
  if (diffDays < 7)
    return `${diffDays} j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function NotificationsScreen({ onGoBack }: NotificationsScreenProps) {
  const { semantic } = useTheme()
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data)
      }
    }
    catch { /* ignore */ }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const onRefresh = () => {
    setRefreshing(true)
    fetchNotifications()
  }

  const markAsRead = async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
    )
  }

  const markAllAsRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'PATCH' })
    setNotifications(prev =>
      prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    )
  }

  const unreadCount = notifications.filter(n => !n.readAt).length

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  const renderItem = ({ item, index }: { item: NotificationItem, index: number }) => {
    const Icon = TYPE_ICONS[item.type] ?? PackageIcon
    const isUnread = !item.readAt

    return (
      <StaggerItem index={index}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight },
            isUnread && { borderLeftColor: colors.green[400], borderLeftWidth: 3 },
          ]}
          onPress={() => {
            if (isUnread)
              markAsRead(item.id)
          }}
        >
          <View style={[styles.iconWrap, { backgroundColor: isUnread ? `${colors.green[400]}15` : semantic.bgSurface }]}>
            <Icon size={18} color={isUnread ? colors.green[600] : colors.neutral[400]} strokeWidth={2} />
          </View>
          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: semantic.textPrimary }, isUnread && styles.titleBold]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.time, { color: semantic.textTertiary }]}>
                {formatRelativeTime(item.createdAt)}
              </Text>
            </View>
            <Text style={[styles.body, { color: semantic.textSecondary }]} numberOfLines={2}>
              {item.body}
            </Text>
          </View>
          {isUnread && <View style={styles.dot} />}
        </Pressable>
      </StaggerItem>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: semantic.borderLight }]}>
        <Pressable onPress={onGoBack} hitSlop={8}>
          <ChevronLeft size={24} color={semantic.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: semantic.textPrimary }]}>
          Notifications
          {unreadCount > 0 && ` (${unreadCount})`}
        </Text>
        {unreadCount > 0 && (
          <Pressable onPress={markAllAsRead} hitSlop={8}>
            <CheckCheck size={22} color={colors.green[600]} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {notifications.length === 0
        ? (
            <View style={styles.empty}>
              <BellOff size={48} color={colors.neutral[300]} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>
                Aucune notification
              </Text>
            </View>
          )
        : (
            <FlatList
              data={notifications}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green[400]} />
              }
            />
          )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
    flex: 1,
    marginLeft: spacing[3],
  },
  list: { padding: spacing[3], gap: spacing[2] },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing[3],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[2],
  },
  title: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    flex: 1,
  },
  titleBold: { fontFamily: fonts.sansBd },
  time: { fontFamily: fonts.sans, fontSize: 12 },
  body: { fontFamily: fonts.sans, fontSize: 13, marginTop: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green[400],
    marginTop: spacing[2],
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[3],
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 15,
  },
})
