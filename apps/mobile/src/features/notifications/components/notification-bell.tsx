import { useFocusEffect } from '@react-navigation/native'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { NOTIFICATION_AUDIENCE } from '../../../utils/app-variant'

/**
 * Unread notifications for this app's audience, re-counted on every focus.
 *
 * Tied to who is signed in: signing out used to leave the badge showing the
 * previous account's count, because a refused request was treated like a
 * network hiccup and the old value was kept.
 */
export function useUnreadNotificationCount(): number {
  const { data: session } = useSession()
  const userId = session?.user.id ?? null
  const [count, setCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      if (userId === null) {
        setCount(0)
        return
      }

      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch(`/api/notifications/count?audience=${NOTIFICATION_AUDIENCE}`)
          if (cancelled) {
            return
          }
          // A refused session is not a hiccup: there is nothing to keep.
          if (res.status === 401) {
            setCount(0)
            return
          }
          if (res.ok) {
            const data = await res.json() as { count?: number }
            setCount(typeof data.count === 'number' ? data.count : 0)
          }
        }
        catch {
          // keep the previous count on a network hiccup
        }
      }
      load()
      return () => {
        cancelled = true
      }
    }, [userId]),
  )

  return count
}

interface NotificationBellProps {
  onPress: () => void
}

/** Header bell with an unread badge, shared by the app variants. */
export function NotificationBell({ onPress }: NotificationBellProps) {
  const { semantic } = useTheme()
  const unreadCount = useUnreadNotificationCount()

  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : 'Notifications'}
    >
      <Bell size={22} color={semantic.textSecondary} strokeWidth={2.2} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 8.5,
    backgroundColor: colors.coral[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.neutral[0],
    fontFamily: fonts.sansBd,
    fontSize: 10,
    lineHeight: 12,
  },
})
