import Store from 'lucide-react-native/dist/esm/icons/store'
import UserIcon from 'lucide-react-native/dist/esm/icons/user'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

export type ProfileMode = 'buyer' | 'seller'

interface ModeSwitchProps {
  mode: ProfileMode
  onChange: (mode: ProfileMode) => void
}

/**
 * Sélecteur de persona « Acheteur / Vendeur ». Affiché en tête du Profil et du
 * Tableau de bord pour les fournisseurs validés : sépare clairement les deux
 * contextes (j'achète ↔ je vends) et offre un aller-retour évident entre eux.
 */
export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  const { semantic } = useTheme()

  function renderSegment(value: ProfileMode, label: string, Icon: typeof Store) {
    const active = mode === value
    return (
      <Pressable
        style={[styles.segment, active && { backgroundColor: semantic.bgPrimaryLight }]}
        onPress={() => onChange(value)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
      >
        <Icon size={16} color={active ? semantic.textPrimaryColor : semantic.textTertiary} strokeWidth={2.2} />
        <Text style={[styles.label, { color: active ? semantic.textPrimaryColor : semantic.textSecondary }, active && styles.labelActive]}>
          {label}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgCard }]} accessibilityRole="tablist">
      {renderSegment('buyer', 'Acheteur', UserIcon)}
      {renderSegment('seller', 'Vendeur', Store)}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: spacing[4],
    borderRadius: radius.lg,
    padding: spacing[1],
    gap: spacing[1],
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderRadius: radius.md,
  },
  label: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  labelActive: {
    fontFamily: fonts.sansSb,
  },
})
