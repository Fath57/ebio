import Check from 'lucide-react-native/dist/esm/icons/check'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { colors } from '../../../theme/theme'

interface SupplierMarkerProps {
  isValidated: boolean
  /** Pin agrandi et assombri quand la fiche du fournisseur est ouverte. */
  isSelected?: boolean
}

/** Goutte de carte classique, dessinée dans un viewBox 24×34. */
const PIN_PATH = 'M12 0C5.373 0 0 5.373 0 12c0 6.9 7.2 16.2 10.65 20.4a1.75 1.75 0 0 0 2.7 0C16.8 28.2 24 18.9 24 12 24 5.373 18.627 0 12 0Z'

const PIN_RATIO = 34 / 24
const WIDTH_DEFAULT = 30
const WIDTH_SELECTED = 40

/**
 * Marqueur fournisseur : goutte pleine à contour blanc, pastille centrale
 * blanche, coche verte pour les fournisseurs validés. Toujours vert — la
 * marque — l'ouverture se lit dans la fiche ; la taille porte la sélection.
 */
export function SupplierMarker({ isValidated, isSelected = false }: SupplierMarkerProps) {
  const width = isSelected ? WIDTH_SELECTED : WIDTH_DEFAULT
  const height = width * PIN_RATIO
  const fill = isSelected ? colors.green[800] : colors.green[400]

  // Centre de la tête du pin : (12/24, 12/34) du viewBox.
  const headSize = width * 0.34
  const headTop = height * (12 / 34) - headSize / 2
  const headLeft = width / 2 - headSize / 2

  return (
    <View style={[styles.wrapper, { width, height }]}>
      <Svg width={width} height={height} viewBox="0 0 24 34">
        <Path d={PIN_PATH} fill={fill} stroke={colors.neutral[0]} strokeWidth={1.5} />
        <Circle cx={12} cy={12} r={5} fill={colors.neutral[0]} />
      </Svg>

      {isValidated && (
        <View style={[styles.head, { top: headTop, left: headLeft, width: headSize, height: headSize }]}>
          <Check size={headSize * 0.85} color={fill} strokeWidth={3.5} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  head: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
