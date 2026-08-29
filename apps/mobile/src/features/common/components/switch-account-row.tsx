import LogOut from 'lucide-react-native/dist/esm/icons/log-out'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface SwitchAccountRowProps {
  /** Name / e-mail of the signed-in account, so a wrong account is obvious. */
  accountLabel: string | null
  onSwitch: () => void
}

/**
 * Footer for gate / onboarding screens: shows who is signed in and offers
 * to sign out — landing on such a screen with the wrong account is the
 * most common reason to be stuck there.
 */
export function SwitchAccountRow({ accountLabel, onSwitch }: SwitchAccountRowProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.wrap}>
      {accountLabel
        ? (
            <Text style={[styles.account, { color: semantic.textTertiary }]}>
              Connecté en tant que
              {' '}
              {accountLabel}
            </Text>
          )
        : null}
      <Pressable
        style={styles.button}
        onPress={onSwitch}
        accessibilityRole="button"
        accessibilityLabel="Changer de compte"
      >
        <LogOut size={16} color={colors.coral[400]} strokeWidth={2} />
        <Text style={[styles.buttonText, { color: colors.coral[400] }]}>Changer de compte</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing[6],
    alignItems: 'center',
  },
  account: {
    ...typography.bodyS,
    textAlign: 'center',
  },
  button: {
    minHeight: 44,
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[1],
  },
  buttonText: {
    ...typography.caption,
    fontSize: 13,
  },
})
