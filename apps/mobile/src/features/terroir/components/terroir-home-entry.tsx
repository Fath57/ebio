import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { PressableCard } from '../../common/components/pressable-card'
import { useTerroirCountries, useTerroirEnabled } from '../terroir-api'

interface TerroirHomeEntryProps {
  onPress: () => void
}

const MAX_NAMED_COUNTRIES = 3

/** « en France et en Belgique », « en France, en Belgique, au Canada et ailleurs », else « à l’étranger ». */
export function servedPlaces(inPhrases: string[]): string {
  if (inPhrases.length === 0)
    return 'à l’étranger'
  const named = inPhrases.slice(0, MAX_NAMED_COUNTRIES)
  const parts = inPhrases.length > MAX_NAMED_COUNTRIES ? [...named, 'ailleurs'] : named
  if (parts.length === 1)
    return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1] ?? ''}`
}

/** The home screen's way into the Terroir space; hidden while the module is off. */
export function TerroirHomeEntry({ onPress }: TerroirHomeEntryProps) {
  const enabled = useTerroirEnabled()
  const countries = useTerroirCountries(false, enabled)
  if (!enabled)
    return null
  const title = `Le goût du pays, livré ${servedPlaces((countries ?? []).map(country => country.inPhrase))}`
  return (
    <PressableCard
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`La Valise du pays : ${title}`}
    >
      <View style={styles.icon}>
        <Plane size={20} color={colors.earth[800]} strokeWidth={2.2} />
      </View>
      <View style={styles.text}>
        <Text style={styles.overline}>La Valise du pays</Text>
        <Text style={styles.title}>{title}</Text>
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
