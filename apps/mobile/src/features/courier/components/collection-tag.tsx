import type { StyleProp, ViewStyle } from 'react-native'
import { StyleSheet, Text, View } from 'react-native'
import { spacing, typography } from '../../../theme/theme'
import { LuggageTag } from '../../terroir/components/valise/luggage-tag'
import { useValisePalette } from '../../terroir/components/valise/valise-palette'

interface CollectionTagProps {
  style?: StyleProp<ViewStyle>
}

/**
 * The luggage tag a « La Valise du pays » collection wears: kraft paper,
 * leather eyelet and an airmail edge, so the courier tells it from a
 * delivery to a buyer at a glance.
 */
export function CollectionTag({ style }: CollectionTagProps) {
  const palette = useValisePalette()
  return (
    <LuggageTag
      colors={{
        fill: palette.paper,
        stroke: palette.paperEdge,
        hole: palette.page,
        ring: palette.leather,
        string: palette.inkSoft,
        stripeA: palette.stripeA,
        stripeB: palette.stripeB,
      }}
      stripes
      style={[styles.tag, style]}
      contentStyle={styles.content}
    >
      <View accessible accessibilityLabel="Collecte eBio, La Valise du pays">
        <Text style={[styles.overline, { color: palette.sky }]}>Valise du pays</Text>
        <Text style={[styles.title, { color: palette.ink }]}>Collecte eBio</Text>
      </View>
    </LuggageTag>
  )
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
  },
  content: {
    paddingRight: spacing[3],
    paddingTop: spacing[1],
    paddingBottom: spacing[2],
  },
  overline: {
    ...typography.overline,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    ...typography.caption,
    fontFamily: typography.h3.fontFamily,
    fontSize: 13,
  },
})
