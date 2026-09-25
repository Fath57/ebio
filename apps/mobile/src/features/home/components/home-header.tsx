import { useFocusEffect } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import MapIcon from 'lucide-react-native/dist/esm/icons/map'
import Search from 'lucide-react-native/dist/esm/icons/search'
import WalletIcon from 'lucide-react-native/dist/esm/icons/wallet'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../../../lib/auth-client'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { apiFetch } from '../../../utils/api-client'
import { AssistantEntryIcon } from '../../assistant/components/assistant-entry-icon'
import { useAssistantIdentity } from '../../assistant/identity'
import { useUnreadNotificationCount } from '../../notifications/components/notification-bell'

interface HomeHeaderProps {
  /** Libellé de la position courante (ex. « Cotonou, Akpakpa »). */
  locationLabel: string
  /** True when the label is the fallback city, not a position we know. */
  locationIsAssumed?: boolean
  onPickLocation: () => void
  onOpenSearch: () => void
  onOpenMap: () => void
  onOpenNotifications: () => void
  onOpenWallet: () => void
  onOpenAssistant: () => void
}

/**
 * Is the assistant open to buyers?
 *
 * Read from the public settings, because it can be closed from the back-office
 * at any moment — during a spending spike, or when it answers badly. A button
 * that would only answer "indisponible" is worse than no button, so it simply
 * is not drawn.
 */
function useAssistantEnabled(): boolean {
  const [enabled, setEnabled] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch('/api/settings/public')
          if (res.ok && !cancelled) {
            const data = await res.json() as { assistantEnabled?: boolean }
            setEnabled(data.assistantEnabled === true)
          }
        }
        catch {
          // keep whatever we knew: a hiccup must not make the entry blink
        }
      }
      load()
      return () => {
        cancelled = true
      }
    }, []),
  )

  return enabled
}

/**
 * Wallet balance (FCFA), null while unknown or when signed out.
 *
 * Tied to who is signed in. It used to keep whatever it last read, so after a
 * sign-out the header still showed the previous account's money: the request
 * came back refused, and a refusal was handled like a network hiccup.
 */
function useWalletBalance(): number | null {
  const { data: session } = useSession()
  const userId = session?.user.id ?? null
  const [balance, setBalance] = useState<number | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (userId === null) {
        setBalance(null)
        return
      }

      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch('/api/wallet/me?limit=1')
          if (cancelled) {
            return
          }
          if (res.status === 401) {
            setBalance(null)
            return
          }
          if (res.ok) {
            const data = await res.json() as { balance?: number }
            setBalance(typeof data.balance === 'number' ? data.balance : null)
          }
        }
        catch {
          // keep the previous value on a network hiccup
        }
      }
      load()
      return () => {
        cancelled = true
      }
    }, [userId]),
  )

  return balance
}

function formatBalance(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} F`
}

/**
 * Bandeau vert de l'accueil : position à gauche, solde du portefeuille,
 * notifications à droite, puis la barre de recherche sur fond blanc.
 */
export function HomeHeader({
  locationLabel,
  locationIsAssumed = false,
  onPickLocation,
  onOpenSearch,
  onOpenMap,
  onOpenNotifications,
  onOpenWallet,
  onOpenAssistant,
}: HomeHeaderProps) {
  const insets = useSafeAreaInsets()
  const unreadCount = useUnreadNotificationCount()
  const balance = useWalletBalance()
  const assistantEnabled = useAssistantEnabled()
  const assistant = useAssistantIdentity()

  return (
    <View style={[styles.band, { paddingTop: insets.top + spacing[2] }]}>
      <StatusBar style="light" />

      <View style={styles.topRow}>
        <Pressable
          style={styles.location}
          onPress={onPickLocation}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={locationIsAssumed
            ? `Choisir ma position, ${locationLabel} par défaut`
            : `Changer ma position, actuellement ${locationLabel}`}
        >
          <Text style={styles.locationText} numberOfLines={1}>
            {locationIsAssumed ? `${locationLabel} ?` : locationLabel}
          </Text>
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
        {assistantEnabled && (
          <Pressable
            style={styles.circle}
            onPress={onOpenAssistant}
            accessibilityRole="button"
            accessibilityLabel={`Faire mes courses en parlant à ${assistant.name}`}
          >
            <AssistantEntryIcon />
          </Pressable>
        )}
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
