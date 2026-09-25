import Download from 'lucide-react-native/dist/esm/icons/download'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useStoreUpdate } from '../hooks/use-store-update'

/**
 * A version the store holds and this build cannot fetch by itself.
 *
 * Two levels, and the difference is not decoration. A suggestion is a band
 * that can be dismissed; a requirement covers the screen, because the release
 * it names is one where going on would fail anyway — an API that no longer
 * accepts what this build sends, a payment flow that changed.
 */
export function StoreUpdateGate() {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const { level, storeUrl, latest } = useStoreUpdate()
  const [dismissed, setDismissed] = useState(false)

  if (level === 'none' || !storeUrl) {
    return null
  }

  const open = (): void => {
    void Linking.openURL(storeUrl)
  }

  if (level === 'required') {
    return (
      <View style={[styles.blocking, { backgroundColor: semantic.bgPage, paddingTop: insets.top }]}>
        <Download size={40} color={colors.green[600]} strokeWidth={1.8} />
        <Text style={[styles.blockingTitle, { color: semantic.textPrimary }]}>
          Mise à jour nécessaire
        </Text>
        <Text style={[styles.blockingText, { color: semantic.textSecondary }]}>
          Cette version de l'application n'est plus compatible. Installez la dernière
          pour continuer à commander.
        </Text>
        <Pressable style={styles.blockingButton} onPress={open} accessibilityRole="button">
          <Text style={styles.blockingButtonText}>Mettre à jour</Text>
        </Pressable>
      </View>
    )
  }

  if (dismissed) {
    return null
  }

  return (
    <View
      style={[
        styles.band,
        { backgroundColor: semantic.bgPrimaryLight, paddingTop: insets.top + spacing[2] },
      ]}
    >
      <Download size={18} color={colors.green[600]} strokeWidth={2.2} />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: semantic.textPrimary }]}>
          {latest ? `Version ${latest} disponible` : 'Mise à jour disponible'}
        </Text>
        <Text style={[styles.subtitle, { color: semantic.textSecondary }]}>
          Elle s'installe depuis le Play Store.
        </Text>
      </View>
      <Pressable style={styles.action} onPress={open} accessibilityRole="button">
        <Text style={styles.actionText}>Installer</Text>
      </Pressable>
      <Pressable
        style={styles.dismiss}
        onPress={() => setDismissed(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Plus tard"
      >
        <X size={16} color={semantic.textTertiary} strokeWidth={2.4} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    zIndex: 20,
  },
  texts: { flex: 1 },
  title: { ...typography.bodyL, fontFamily: fonts.sansSb },
  subtitle: { ...typography.caption, marginTop: 1 },
  action: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    backgroundColor: colors.green[600],
  },
  actionText: { fontFamily: fonts.sansSb, fontSize: 13, color: colors.neutral[0] },
  dismiss: { padding: spacing[1] },

  blocking: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[6],
  },
  blockingTitle: { ...typography.h1, textAlign: 'center' },
  blockingText: { ...typography.bodyL, textAlign: 'center' },
  blockingButton: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    borderRadius: radius.lg,
    backgroundColor: colors.green[600],
    marginTop: spacing[2],
  },
  blockingButtonText: { ...typography.h3, color: colors.neutral[0] },
})
