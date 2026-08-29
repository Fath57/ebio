import { useFocusEffect } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import MapIcon from 'lucide-react-native/dist/esm/icons/map'
import Search from 'lucide-react-native/dist/esm/icons/search'
import UserIcon from 'lucide-react-native/dist/esm/icons/user'
import WalletIcon from 'lucide-react-native/dist/esm/icons/wallet'
import { useCallback, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'
import { NOTIFICATION_AUDIENCE } from '../../../utils/app-variant'

interface HomeHeaderProps {
  /** Libellé de la position courante (ex. « Cotonou, Akpakpa »). */
  locationLabel: string
  /** URL de l'avatar, si renseigné sur le profil. */
  avatarUrl?: string | null
  onPickLocation: () => void
  onOpenSearch: () => void
  onOpenMap: () => void
  onOpenNotifications: () => void
  onOpenProfile: () => void
  onOpenWallet: () => void
}

/** Unread notifications, re-counted whenever the home screen regains focus. */
function useUnreadCount(): number {
  const [count, setCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch(`/api/notifications/count?audience=${NOTIFICATION_AUDIENCE}`)
          if (res.ok && !cancelled) {
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
    }, []),
  )

  return count
}

/** Wallet balance (FCFA), null while unknown or when signed out. */
function useWalletBalance(): number | null {
  const [balance, setBalance] = useState<number | null>(null)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch('/api/wallet/me?limit=1')
          if (res.ok && !cancelled) {
            const data = await res.json() as { balance?: number }
            setBalance(typeof data.balance === 'number' ? data.balance : null)
          }
        }
        catch {
          // keep the previous value
        }
      }
      load()
      return () => {
        cancelled = true
      }
    }, []),
  )

  return balance
}

function formatBalance(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} F`
}

/**
 * Bandeau vert de l'accueil : position à gauche, solde du portefeuille,
 * notifications et profil à droite, puis la barre de recherche sur fond blanc.
 */
export function HomeHeader({
  locationLabel,
  avatarUrl,
  onPickLocation,
  onOpenSearch,
  onOpenMap,
  onOpenNotifications,
  onOpenProfile,
  onOpenWallet,
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets()
  const unreadCount = useUnreadCount()
  const balance = useWalletBalance()

  return (
    <View style={[styles.band, { paddingTop: insets.top + spacing[2] }]}>
      <StatusBar style="light" />

      <View style={styles.topRow}>
        <Pressable
          style={styles.location}
          onPress={onPickLocation}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Changer ma position, actuellement ${locationLabel}`}
        >
          <Text style={styles.locationText} numberOfLines={1}>{locationLabel}</Text>
          <ChevronDown size={16} color={colors.neutral[0]} strokeWidth={2.6} />
        </Pressable>

        <View style={styles.actions}>
          <Pressable
            style={styles.walletPill}
            onPress={onOpenWallet}
            accessibilityRole="button"
            accessibilityLabel={balance === null ? 'Mon portefeuille' : `Mon portefeuille, solde ${formatBalance(balance)}`}
          >
            <View style={styles.walletIcon}>
              <WalletIcon size={15} color={colors.neutral[0]} strokeWidth={2.4} />
            </View>
            <Text style={styles.walletText}>{balance === null ? '—' : formatBalance(balance)}</Text>
          </Pressable>

          <Pressable
            style={styles.circle}
            onPress={onOpenNotifications}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : 'Notifications'}
          >
            <Bell size={20} color={colors.neutral[900]} strokeWidth={2.2} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={styles.circle}
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel="Mon profil"
          >
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              : <UserIcon size={20} color={colors.neutral[900]} strokeWidth={2.2} />}
          </Pressable>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Pressable
          style={styles.search}
          onPress={onOpenSearch}
          accessibilityRole="search"
          accessibilityLabel="Rechercher un produit ou une boutique"
        >
          <Search size={18} color={colors.neutral[600]} strokeWidth={2.2} />
          <Text style={styles.searchText}>Rechercher un produit, une boutique…</Text>
        </Pressable>
        <Pressable
          style={styles.circle}
          onPress={onOpenMap}
          accessibilityRole="button"
          accessibilityLabel="Rechercher sur la carte"
        >
          <MapIcon size={20} color={colors.green[600]} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: colors.green[600],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    gap: spacing[3],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    minHeight: 44,
  },
  location: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 44,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: fonts.sansBd,
    fontSize: 15,
    color: colors.neutral[0],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 44,
    paddingLeft: spacing[1],
    paddingRight: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.neutral[0],
  },
  walletIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletText: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
    color: colors.neutral[900],
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 44,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.neutral[0],
  },
  searchText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.neutral[600],
  },
})
