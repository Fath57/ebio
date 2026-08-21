import { useFocusEffect } from '@react-navigation/native'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Search from 'lucide-react-native/dist/esm/icons/search'
import { useCallback, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ScreenHeader } from '../../common/components/screen-header'

interface HomeHeaderProps {
  /** Libellé de la position courante (ex. « Cotonou, Bénin »). */
  locationLabel: string
  /** Initiales de repli quand l'utilisateur n'a pas de photo. */
  initials: string
  /** URL de l'avatar, si renseigné sur le profil. */
  avatarUrl?: string | null
  onPickLocation: () => void
  onOpenSearch: () => void
  onOpenNotifications: () => void
  onOpenProfile: () => void
}

/**
 * Barre supérieure de l'accueil. Composition de `ScreenHeader` : le logo prend
 * la place du bouton retour via `leadingSlot`, la puce de localisation celle du
 * titre, et les actions occupent le `rightSlot`.
 */
/** Unread notifications, re-counted whenever the home screen regains focus. */
function useUnreadCount(): number {
  const [count, setCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch('/api/notifications/unread')
          if (res.ok && !cancelled) {
            const items = await res.json() as unknown[]
            setCount(Array.isArray(items) ? items.length : 0)
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

export function HomeHeader({
  locationLabel,
  initials,
  avatarUrl,
  onPickLocation,
  onOpenSearch,
  onOpenNotifications,
  onOpenProfile,
}: HomeHeaderProps) {
  const unreadCount = useUnreadCount()
  const { semantic } = useTheme()

  return (
    <ScreenHeader
      leadingSlot={(
        <View style={styles.leading}>
          <Image
            source={require('../../../../assets/logo-transparent.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="eBio"
          />
          <Pressable
            style={[styles.locationChip, { backgroundColor: semantic.bgPrimaryLight }]}
            onPress={onPickLocation}
            accessibilityRole="button"
            accessibilityLabel={`Changer ma position, actuellement ${locationLabel}`}
          >
            <MapPin size={13} color={colors.green[400]} strokeWidth={2.4} />
            <Text style={[styles.locationText, { color: semantic.textPrimaryColor }]} numberOfLines={1}>
              {locationLabel}
            </Text>
            <ChevronDown size={13} color={colors.green[400]} strokeWidth={2.4} />
          </Pressable>
        </View>
      )}
      rightSlot={(
        <View style={styles.actions}>
          <Pressable
            style={styles.iconButton}
            onPress={onOpenSearch}
            hitSlop={8}
            accessibilityRole="search"
            accessibilityLabel="Rechercher un produit ou un fournisseur"
          >
            <Search size={20} color={semantic.textSecondary} strokeWidth={2.2} />
          </Pressable>

          <Pressable
            style={styles.iconButton}
            onPress={onOpenNotifications}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : 'Notifications'}
          >
            <Bell size={20} color={semantic.textSecondary} strokeWidth={2.2} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={onOpenProfile}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Mon profil"
          >
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                )}
          </Pressable>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -1,
    right: -2,
    width: 17,
    height: 17,
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

  leading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 58,
    height: 30,
  },
  locationChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    marginLeft: spacing[2],
    paddingHorizontal: spacing[3],
    minHeight: 32,
    borderRadius: radius.pill,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  iconButton: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.green[400],
  },
  avatarText: {
    fontFamily: fonts.sansBd,
    fontSize: 13,
    color: colors.neutral[0],
  },
})
