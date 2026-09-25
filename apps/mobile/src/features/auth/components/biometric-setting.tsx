import type { TrustedDeviceRow } from '../hooks/use-biometric-auth'
import ScanFace from 'lucide-react-native/dist/esm/icons/scan-face'
import { useState } from 'react'
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { useBiometricAuth } from '../hooks/use-biometric-auth'

/**
 * Turning fingerprint sign-in on, and taking it off a phone.
 *
 * Shared by the three apps rather than written into the buyer's profile
 * alone: the sign-in screen is common to all of them, so a courier who could
 * never switch it on would simply never see the button.
 *
 * Renders nothing where the phone has no fingerprint enrolled — an inert
 * switch explains less than an absent one.
 */
export function BiometricSetting() {
  const { semantic } = useTheme()
  const { isAvailable, isEnabled, devices, busy, enable, revoke } = useBiometricAuth()
  const [revoking, setRevoking] = useState<TrustedDeviceRow | null>(null)

  if (!isAvailable) {
    return null
  }

  async function handleToggle(value: boolean): Promise<void> {
    if (value) {
      await enable()
      return
    }
    const current = devices.find(device => device.current)
    if (current) {
      await revoke(current.id, true)
    }
  }

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.left}>
          <View style={[styles.icon, { backgroundColor: colors.green[50] }]}>
            <ScanFace size={18} color={colors.green[600]} />
          </View>
          <View style={styles.label}>
            <Text style={[styles.title, { color: semantic.textPrimary }]}>
              Connexion par empreinte
            </Text>
            <Text style={[styles.hint, { color: semantic.textTertiary }]}>
              Sur ce téléphone, sans retaper votre mot de passe
            </Text>
          </View>
        </View>
        <Switch
          value={isEnabled}
          disabled={busy}
          onValueChange={handleToggle}
          trackColor={{ true: colors.green[400], false: colors.neutral[200] }}
          thumbColor={colors.neutral[0]}
        />
      </View>

      {/* The other phones are listed so they can be taken away from here —
          that is the point of trusting them one at a time. */}
      {devices.filter(device => !device.current).map(device => (
        <View key={device.id} style={styles.trustedRow}>
          <View style={styles.label}>
            <Text style={[styles.trustedName, { color: semantic.textSecondary }]}>
              {device.label}
            </Text>
            <Text style={[styles.hint, { color: semantic.textTertiary }]}>
              {device.lastUsedAt === null
                ? 'Jamais utilisé'
                : `Utilisé le ${new Date(device.lastUsedAt).toLocaleDateString('fr-FR')}`}
            </Text>
          </View>
          <TouchableOpacity
            hitSlop={10}
            disabled={busy}
            onPress={() => setRevoking(device)}
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${device.label}`}
          >
            <Text style={styles.revoke}>Retirer</Text>
          </TouchableOpacity>
        </View>
      ))}

      <ConfirmModal
        visible={revoking !== null}
        icon={ScanFace}
        iconColor={colors.coral[400]}
        iconBg={colors.coral[50]}
        title={revoking === null ? '' : `Retirer ${revoking.label} ?`}
        message="Ce téléphone ne pourra plus ouvrir votre compte avec une empreinte. Le mot de passe fonctionnera toujours."
        confirmLabel="Retirer"
        confirmStyle="destructive"
        onConfirm={() => {
          const device = revoking
          setRevoking(null)
          if (device) {
            void revoke(device.id, device.current)
          }
        }}
        onCancel={() => setRevoking(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.sansMd,
    fontSize: 15,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  trustedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingRight: spacing[4],
    paddingBottom: spacing[3],
    // Aligned with the label above, past the icon.
    paddingLeft: spacing[4] + 36 + spacing[3],
  },
  trustedName: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  revoke: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.coral[600],
  },
})
