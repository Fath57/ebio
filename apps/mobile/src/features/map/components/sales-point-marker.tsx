import Store from 'lucide-react-native/dist/esm/icons/store'
import { StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '../../../theme/theme'

interface SalesPointMarkerProps {
  /** Plaque agrandie et assombrie quand la fiche du point est ouverte. */
  isSelected?: boolean
}

/**
 * A sales point is not the shop itself: it is a stall the shop holds
 * elsewhere. Sharing the supplier's green teardrop made the two impossible to
 * tell apart on a crowded map, so this one differs twice over — a squarer
 * plaque instead of a drop, and the palette's ochre instead of the brand
 * green. Shape carries the difference for anyone who reads colour poorly.
 *
 * Drawn in a 26×34 viewBox: a rounded plaque with a short foot pointing at
 * the ground, so the anchor still sits on the exact spot.
 */
const PLAQUE_PATH = 'M5 0h16a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5h-5.2l-2.1 7.2a1.8 1.8 0 0 1-3.4 0L8.2 26H5a5 5 0 0 1-5-5V5a5 5 0 0 1 5-5Z'

const PLAQUE_RATIO = 34 / 26
const WIDTH_DEFAULT = 28
const WIDTH_SELECTED = 38

export function SalesPointMarker({ isSelected = false }: SalesPointMarkerProps) {
  const width = isSelected ? WIDTH_SELECTED : WIDTH_DEFAULT
  const height = width * PLAQUE_RATIO
  // Coral, the charter's red: a sales point is not a shop, and the map has
  // to say so at a glance. Darker when selected, as everywhere else.
  const fill = isSelected ? colors.coral[600] : colors.coral[400]

  // Centre of the plaque, excluding the foot: (13/26, 13/34) of the viewBox.
  const iconSize = width * 0.46
  const iconTop = height * (13 / 34) - iconSize / 2
  const iconLeft = width / 2 - iconSize / 2

  return (
    <View style={[styles.wrapper, { width, height }]}>
      <Svg width={width} height={height} viewBox="0 0 26 34">
        <Path d={PLAQUE_PATH} fill={fill} stroke={colors.neutral[0]} strokeWidth={1.5} />
      </Svg>

      <View style={[styles.icon, { top: iconTop, left: iconLeft, width: iconSize, height: iconSize }]}>
        <Store size={iconSize} color={colors.neutral[0]} strokeWidth={2.4} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  icon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
