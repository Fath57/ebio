import type { CourierProfile } from '../types'
import XCircle from 'lucide-react-native/dist/esm/icons/circle-x'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import ShieldAlert from 'lucide-react-native/dist/esm/icons/shield-alert'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { SwitchAccountRow } from '../../common/components/switch-account-row'

interface CourierPendingScreenProps {
  profile: CourierProfile
  onRefresh: () => void
  onEdit: () => void
  accountLabel: string | null
  onSwitchAccount: () => void
}

/** Waiting room: application under review, rejected (with reason) or suspended. */
export function CourierPendingScreen({ profile, onRefresh, onEdit, accountLabel, onSwitchAccount }: CourierPendingScreenProps) {
  const { semantic } = useTheme()
  const isRejected = profile.validationStatus === 'REJECTED'
  const isSuspended = profile.validationStatus === 'SUSPENDED'

  const Icon = isSuspended ? ShieldAlert : isRejected ? XCircle : Clock
  const iconColor = isRejected || isSuspended ? colors.coral[400] : colors.earth[400]
  const title = isSuspended
    ? 'Compte suspendu'
    : isRejected
      ? 'Candidature refusée'
      : 'Candidature en cours d\'examen'
  const body = isSuspended
    ? 'Votre accès aux courses est suspendu. Contactez l\'équipe eBio pour en savoir plus.'
    : isRejected
      ? 'Votre candidature n\'a pas été retenue. Vous pouvez la corriger et la renvoyer.'
      : 'L\'équipe eBio examine votre candidature. Vous serez notifié dès qu\'elle sera validée.'

  return (
    <ScrollView style={{ backgroundColor: semantic.bgPage }} contentContainerStyle={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: semantic.bgCard }]}>
        <Icon size={40} color={iconColor} strokeWidth={1.8} />
      </View>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: semantic.textSecondary }]}>{body}</Text>

      {isRejected && profile.rejectionReason
        ? (
            <View style={[styles.reason, { backgroundColor: colors.coral[50] }]}>
              <Text style={[styles.reasonLabel, { color: colors.coral[600] }]}>Motif du refus</Text>
              <Text style={[styles.reasonText, { color: colors.coral[800] }]}>{profile.rejectionReason}</Text>
            </View>
          )
        : null}

      {isRejected
        ? (
            <Pressable style={styles.primary} onPress={onEdit} accessibilityRole="button" accessibilityLabel="Corriger ma candidature">
              <Text style={styles.primaryText}>Corriger ma candidature</Text>
            </Pressable>
          )
        : null}

      {!isSuspended
        ? (
            <Pressable
              style={[styles.secondary, { borderColor: semantic.borderNormal }]}
              onPress={onRefresh}
              accessibilityRole="button"
              accessibilityLabel="Actualiser le statut"
            >
              <Text style={[styles.secondaryText, { color: semantic.textPrimary }]}>Actualiser</Text>
            </Pressable>
          )
        : null}
      <SwitchAccountRow accountLabel={accountLabel} onSwitch={onSwitchAccount} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[4],
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
  },
  body: {
    ...typography.bodyL,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  reason: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    padding: spacing[4],
    marginTop: spacing[5],
  },
  reasonLabel: {
    ...typography.overline,
  },
  reasonText: {
    ...typography.bodyS,
    marginTop: spacing[1],
  },
  primary: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[6],
  },
  primaryText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
  secondary: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[3],
  },
  secondaryText: {
    ...typography.caption,
    fontSize: 13,
  },
})
