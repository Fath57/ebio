import type { CourierProfile } from '../types'
import type { CourierZone } from './zone-picker'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import KeyRound from 'lucide-react-native/dist/esm/icons/key-round'
import LogOut from 'lucide-react-native/dist/esm/icons/log-out'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { signOut } from '../../../lib/auth-client'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { BiometricSetting } from '../../auth/components/biometric-setting'
import { appAlert } from '../../common/components/app-alert'
import { StarRating } from '../../common/components/star-rating'
import { VEHICLE_LABELS } from '../types'
import { AvailabilityToggle } from './availability-toggle'
import { ZonePickerModal } from './zone-picker'

interface CourierProfileScreenProps {
  onOpenNotifications: () => void
  /** Rechargement du profil après un changement de zone. */
  onZoneChanged?: () => void
  onChangePassword: () => void
  profile: CourierProfile
  onAvailabilityChanged: (isAvailable: boolean) => void
  onEdit: () => void
  onSignedOut: () => void
}

function formatRatingAvg(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Courier profile tab: identity, availability, application data, sign out. */
export function CourierProfileScreen({ profile, onAvailabilityChanged, onEdit, onSignedOut, onOpenNotifications, onChangePassword, onZoneChanged }: CourierProfileScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const [zonePickerOpen, setZonePickerOpen] = useState(false)
  const [savingZone, setSavingZone] = useState(false)
  const hasZonePoint = profile.zoneLatitude != null && profile.zoneLongitude != null
  // Le cercle doit tenir dans le cadre : même règle que le sélecteur de zone.
  const zoneDelta = ((profile.zoneRadiusKm ?? 10) * 2.6) / 111

  function confirmSignOut() {
    appAlert('Se déconnecter', 'Vous ne recevrez plus de courses jusqu\'à votre prochaine connexion.', [
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: () => {
          signOut().then(onSignedOut)
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  /**
   * Enregistre la seule zone. `PATCH /couriers/me` accepte une mise à jour
   * partielle : inutile de faire repasser le livreur par tout son formulaire
   * d'inscription pour déplacer un point sur une carte.
   */
  const saveZone = useCallback(async (picked: CourierZone) => {
    setZonePickerOpen(false)
    setSavingZone(true)
    try {
      const res = await apiFetch('/api/couriers/me', {
        method: 'PATCH',
        body: JSON.stringify({
          zone: picked.label,
          zoneLatitude: picked.latitude,
          zoneLongitude: picked.longitude,
          zoneRadiusKm: picked.radiusKm,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null
        appAlert('Zone non enregistrée', body?.message ?? 'Réessayez dans un instant.')
        return
      }
      onZoneChanged?.()
    }
    catch {
      appAlert('Zone non enregistrée', 'Vérifiez votre connexion et réessayez.')
    }
    finally {
      setSavingZone(false)
    }
  }, [onZoneChanged])

  return (
    <ScrollView
      style={{ backgroundColor: semantic.bgPage }}
      // La barre d'onglets flotte par-dessus le contenu : une marge fixe
      // laissait les derniers boutons — Notifications, Se déconnecter — sous
      // elle, et d'autant plus que le bandeau de gestes est haut.
      contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight + spacing[6] }]}
    >
      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <View style={styles.identityRow}>
          <View style={[styles.avatar, { backgroundColor: semantic.bgPrimaryLight }]}>
            <Bike size={26} color={colors.green[600]} strokeWidth={2} />
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.name, { color: semantic.textPrimary }]}>{profile.fullName}</Text>
            <Text style={[styles.phone, { color: semantic.textSecondary }]}>{profile.phone}</Text>
          </View>
          <AvailabilityToggle isAvailable={profile.isAvailable} onChanged={onAvailabilityChanged} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <Text style={[styles.label, styles.firstLabel, { color: semantic.textTertiary }]}>Ma note</Text>
        {profile.ratingCount > 0 && profile.ratingAvg !== null
          ? (
              <View style={styles.ratingRow}>
                <Text style={[styles.ratingValue, { color: semantic.textPrimary }]}>
                  {`${formatRatingAvg(profile.ratingAvg)} / 5`}
                </Text>
                <View style={styles.ratingStars}>
                  <StarRating value={profile.ratingAvg} size={18} />
                  <Text style={[styles.ratingCount, { color: semantic.textSecondary }]}>
                    {`${profile.ratingCount} avis`}
                  </Text>
                </View>
              </View>
            )
          : (
              <Text style={[styles.value, { color: semantic.textSecondary }]}>
                Pas encore de note — vos premières livraisons compteront.
              </Text>
            )}
      </View>

      {/* La zone décide des courses reçues : elle mérite sa carte, pas une
          ligne de texte noyée dans les informations d'inscription. Le rayon
          est affiché parce que c'est lui qui filtre, pas le nom du quartier. */}
      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <Text style={[styles.label, styles.firstLabel, { color: semantic.textTertiary }]}>
          Ma zone de livraison
        </Text>
        <View style={styles.zoneRow}>
          <MapPin size={18} color={colors.green[600]} strokeWidth={2.2} />
          <Text style={[styles.zoneValue, { color: semantic.textPrimary }]}>
            {profile.zone}
          </Text>
        </View>

        {/* Le point, montré et non décrit : « 10 km autour de Fidjrossè » ne
            dit pas autour de quel endroit exactement. La carte est inerte —
            sans quoi elle volerait le défilement de la page. */}
        {hasZonePoint && (
          <View style={styles.zoneMap} pointerEvents="none">
            <MapView
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              initialRegion={{
                latitude: profile.zoneLatitude as number,
                longitude: profile.zoneLongitude as number,
                latitudeDelta: zoneDelta,
                longitudeDelta: zoneDelta,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              toolbarEnabled={false}
            >
              <Circle
                center={{ latitude: profile.zoneLatitude as number, longitude: profile.zoneLongitude as number }}
                radius={(profile.zoneRadiusKm ?? 10) * 1000}
                strokeColor={colors.green[400]}
                strokeWidth={2}
                fillColor="rgba(42, 157, 78, 0.15)"
              />
              <Marker
                coordinate={{ latitude: profile.zoneLatitude as number, longitude: profile.zoneLongitude as number }}
              />
            </MapView>
          </View>
        )}

        <Text style={[styles.zoneHint, { color: semantic.textSecondary }]}>
          {hasZonePoint
            ? `Vous recevez les courses dans un rayon de ${profile.zoneRadiusKm ?? 10} km autour de ce point.`
            : 'Aucun point précis enregistré — placez-le sur la carte pour recevoir les courses autour de vous.'}
        </Text>

        <Pressable
          style={[styles.editButton, { borderColor: semantic.borderNormal }]}
          onPress={() => setZonePickerOpen(true)}
          disabled={savingZone}
          accessibilityRole="button"
          accessibilityLabel="Modifier ma zone de livraison"
        >
          {savingZone
            ? <ActivityIndicator size="small" color={colors.green[600]} />
            : (
                <>
                  <MapPin size={16} color={semantic.textPrimary} strokeWidth={2} />
                  <Text style={[styles.editText, { color: semantic.textPrimary }]}>
                    Modifier ma zone
                  </Text>
                </>
              )}
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
        <Text style={[styles.label, styles.firstLabel, { color: semantic.textTertiary }]}>Moyen de transport</Text>
        <Text style={[styles.value, { color: semantic.textPrimary }]}>{VEHICLE_LABELS[profile.vehicleType]}</Text>
        <Text style={[styles.label, { color: semantic.textTertiary }]}>Livreur depuis</Text>
        <Text style={[styles.value, { color: semantic.textPrimary }]}>
          {new Date(profile.validatedAt ?? profile.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>

        <Pressable
          style={[styles.editButton, { borderColor: semantic.borderNormal }]}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Modifier mon profil"
        >
          <Text style={[styles.editText, { color: semantic.textPrimary }]}>Modifier mon profil</Text>
        </Pressable>

        <Pressable
          style={[styles.editButton, { borderColor: semantic.borderNormal }]}
          onPress={onOpenNotifications}
          accessibilityRole="button"
          accessibilityLabel="Voir mes notifications"
        >
          <Bell size={16} color={semantic.textPrimary} strokeWidth={2} />
          <Text style={[styles.editText, { color: semantic.textPrimary }]}>Notifications</Text>
        </Pressable>

        <Pressable
          style={[styles.editButton, { borderColor: semantic.borderNormal }]}
          onPress={onChangePassword}
          accessibilityRole="button"
          accessibilityLabel="Modifier mon mot de passe"
        >
          <KeyRound size={16} color={semantic.textPrimary} strokeWidth={2} />
          <Text style={[styles.editText, { color: semantic.textPrimary }]}>Modifier mon mot de passe</Text>
        </Pressable>
      </View>

      <View style={[styles.biometricCard, { backgroundColor: semantic.bgCard }]}>
        <BiometricSetting />
      </View>

      <Pressable
        style={[styles.signOut, { borderColor: colors.coral[400] }]}
        onPress={confirmSignOut}
        accessibilityRole="button"
        accessibilityLabel="Se déconnecter"
      >
        <LogOut size={16} color={colors.coral[400]} strokeWidth={2} />
        <Text style={[styles.signOutText, { color: colors.coral[400] }]}>Se déconnecter</Text>
      </Pressable>

      <ZonePickerModal
        visible={zonePickerOpen}
        initial={profile.zoneLatitude != null && profile.zoneLongitude != null
          ? {
              label: profile.zone,
              latitude: profile.zoneLatitude,
              longitude: profile.zoneLongitude,
              radiusKm: profile.zoneRadiusKm ?? 10,
            }
          : null}
        onConfirm={saveZone}
        onClose={() => setZonePickerOpen(false)}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[1],
  },
  zoneValue: {
    ...typography.bodyL,
    flex: 1,
  },
  zoneMap: {
    height: 150,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  zoneHint: {
    ...typography.bodyS,
    marginBottom: spacing[3],
  },
  container: {
    padding: spacing[4],
    paddingBottom: spacing[12],
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
  },
  name: {
    ...typography.h3,
  },
  phone: {
    ...typography.bodyS,
    marginTop: 1,
  },
  label: {
    ...typography.overline,
    marginTop: spacing[3],
  },
  firstLabel: {
    marginTop: 0,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  ratingValue: {
    ...typography.h1,
  },
  ratingStars: {
    flex: 1,
  },
  ratingCount: {
    ...typography.caption,
    marginTop: 2,
  },
  value: {
    ...typography.bodyL,
    marginTop: 2,
  },
  editButton: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[4],
  },
  editText: {
    ...typography.caption,
    fontSize: 13,
  },
  biometricCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing[3],
  },
  signOut: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  signOutText: {
    ...typography.caption,
    fontSize: 13,
  },
})
