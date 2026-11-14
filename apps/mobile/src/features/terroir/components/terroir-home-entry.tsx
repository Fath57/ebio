import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { PressableCard } from '../../common/components/pressable-card'
import { useTerroirEnabled } from '../terroir-api'

interface TerroirHomeEntryProps {
  onPress: () => void
}

/** The home screen's way into the Terroir space; hidden while the module is off. */
export function TerroirHomeEntry({ onPress }: TerroirHomeEntryProps) {
  const enabled = useTerroirEnabled()
  if (!enabled)
    return null
  return (
    <PressableCard
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="La Valise du pays : le goût du pays, livré en France et en Belgique"
    >
      <View style={styles.icon}>
        <Plane size={20} color={colors.earth[800]} strokeWidth={2.2} />
      </View>
      <View style={styles.text}>
        <Text style={styles.overline}>La Valise du pays</Text>
        <Text style={styles.title}>Le goût du pays, livré en France et en Belgique</Text>
      </View>
      <ChevronRight size={18} color={colors.earth[800]} strokeWidth={2.4} />
    </PressableCard>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing[4],
    marginTop: spacing[5],
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.earth[50],
    borderWidth: 1,
    borderColor: colors.earth[200],
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.earth[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  overline: {
    ...typography.overline,
    color: colors.earth[600],
  },
  title: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.earth[800],
  },
})
