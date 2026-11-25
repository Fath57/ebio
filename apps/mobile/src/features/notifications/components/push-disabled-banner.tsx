import BellOff from 'lucide-react-native/dist/esm/icons/bell-off'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { usePushDisabled } from '../hooks/use-push-disabled'

interface PushDisabledBannerProps {
  /** What is missed while notifications are off. */
  message: string
}

/** Stays in sight as long as the phone will not ring; nothing otherwise. */
export function PushDisabledBanner({ message }: PushDisabledBannerProps) {
  const { disabled, enable } = usePushDisabled()
  if (!disabled) {
    return null
  }
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <BellOff size={18} color={colors.coral[600]} strokeWidth={2} />
      <Text style={styles.text}>{message}</Text>
      <Pressable
        style={styles.button}
        onPress={() => void enable()}
        accessibilityRole="button"
        accessibilityLabel="Activer les notifications"
      >
        <Text style={styles.buttonText}>Activer</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.coral[50],
    borderWidth: 1,
    borderColor: colors.coral[200],
    borderRadius: radius.lg,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },
  text: {
    ...typography.caption,
    flex: 1,
    color: colors.coral[800],
  },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    backgroundColor: colors.green[600],
  },
  buttonText: {
    ...typography.caption,
    fontFamily: fonts.sansSb,
    color: colors.neutral[0],
  },
})
