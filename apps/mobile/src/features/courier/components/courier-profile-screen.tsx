import type { CourierProfile } from '../types'
import Bell from 'lucide-react-native/dist/esm/icons/bell'
import Bike from 'lucide-react-native/dist/esm/icons/bike'
import KeyRound from 'lucide-react-native/dist/esm/icons/key-round'
import LogOut from 'lucide-react-native/dist/esm/icons/log-out'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { signOut } from '../../../lib/auth-client'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { VEHICLE_LABELS } from '../types'
import { AvailabilityToggle } from './availability-toggle'

interface CourierProfileScreenProps {
  onOpenNotifications: () => void
  onChangePassword: () => void
  profile: CourierProfile
  onAvailabilityChanged: (isAvailable: boolean) => void
  onEdit: () => void
  onSignedOut: () => void
}

/** Courier profile tab: identity, availability, application data, sign out. */
export function CourierProfileScreen({ profile, onAvailabilityChanged, onEdit, onSignedOut, onOpenNotifications, onChangePassword }: CourierProfileScreenProps) {
  const { semantic } = useTheme()

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

  return (
    <ScrollView style={{ backgroundColor: semantic.bgPage }} contentContainerStyle={styles.container}>
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
        <Text style={[styles.label, { color: semantic.textTertiary }]}>Moyen de transport</Text>
        <Text style={[styles.value, { color: semantic.textPrimary }]}>{VEHICLE_LABELS[profile.vehicleType]}</Text>
        <Text style={[styles.label, { color: semantic.textTertiary }]}>Zone d'activité</Text>
        <Text style={[styles.value, { color: semantic.textPrimary }]}>{profile.zone}</Text>
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

      <Pressable
        style={[styles.signOut, { borderColor: colors.coral[400] }]}
        onPress={confirmSignOut}
        accessibilityRole="button"
        accessibilityLabel="Se déconnecter"
      >
        <LogOut size={16} color={colors.coral[400]} strokeWidth={2} />
        <Text style={[styles.signOutText, { color: colors.coral[400] }]}>Se déconnecter</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
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
