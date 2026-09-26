import type { SharedValue } from 'react-native-reanimated'
import { useEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { colors } from '../../../theme/theme'

/** The brand's own colours: a burst in someone else's palette is a sticker. */
const PALETTE = [colors.green[400], colors.earth[400], colors.coral[400], colors.blue[400], colors.green[200]]

/** Enough to read as a burst, few enough to stay a detail. */
const PIECES = 16

/** Long enough to be seen, short enough that nobody waits for it to end. */
const FLIGHT_MS = 1100

/**
 * Dispersion sans hasard.
 *
 * `Math.random` pendant un rendu est une fonction impure — le compilateur
 * React le refuse, et il a raison : le même rendu doit donner le même
 * résultat. Ce bruit dérive de l'indice, donc il disperse tout autant et se
 * reproduit à l'identique.
 */
function noise(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return value - Math.floor(value)
}

interface Piece {
  angle: number
  distance: number
  spin: number
  delay: number
  color: string
  size: number
  isRound: boolean
}

/**
 * A short burst, for the moment an order is placed.
 *
 * Decorative and nothing else: it takes no touch, says nothing to a screen
 * reader, and stands down entirely when the phone asks for reduced motion —
 * someone who turned that on did not turn it on for everything except us.
 */
export function Confetti() {
  const reduced = useReducedMotion()
  const progress = useSharedValue(0)

  const pieces = useMemo<Piece[]>(
    () => Array.from({ length: PIECES }, (_, index) => ({
      // Spread around the circle, with a little scatter so it is not a star.
      angle: (index / PIECES) * Math.PI * 2 + (noise(index, 1) - 0.5) * 0.5,
      distance: 90 + noise(index, 2) * 120,
      spin: (noise(index, 3) - 0.5) * 720,
      delay: noise(index, 4) * 120,
      color: PALETTE[index % PALETTE.length],
      size: 6 + noise(index, 5) * 6,
      isRound: index % 3 === 0,
    })),
    [],
  )

  // Lancée une fois, au montage : régler une valeur animée pendant le rendu
  // la relancerait à chaque passage.
  useEffect(() => {
    if (reduced) {
      return
    }
    progress.value = withDelay(120, withTiming(1, { duration: FLIGHT_MS }))
  }, [progress, reduced])

  if (reduced) {
    return null
  }

  return (
    <View style={styles.field} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pieces.map((piece, index) => (
        <ConfettiPiece key={`piece-${index}`} piece={piece} progress={progress} />
      ))}
    </View>
  )
}

interface ConfettiPieceProps {
  piece: Piece
  progress: SharedValue<number>
}

/**
 * One piece: out, then down.
 *
 * A single shared progress drives them all — sixteen animations would each
 * pay their own price, one shared value costs what one animation costs.
 */
function ConfettiPiece({ piece, progress }: ConfettiPieceProps) {
  const style = useAnimatedStyle(() => {
    const t = progress.value
    // Out fast, then slowing: the square root front-loads the distance.
    const reach = Math.sqrt(t) * piece.distance
    const x = Math.cos(piece.angle) * reach
    // Gravity added to the outward flight, so they arc rather than shoot.
    const y = Math.sin(piece.angle) * reach + t * t * 180
    return {
      opacity: interpolate(t, [0, 0.1, 0.75, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.spin * t}deg` },
        { scale: interpolate(t, [0, 0.15, 1], [0.4, 1, 0.85]) },
      ],
    }
  })

  return (
    <Animated.View
      style={[
        {
          width: piece.size,
          height: piece.isRound ? piece.size : piece.size * 1.8,
          borderRadius: piece.isRound ? piece.size / 2 : 1,
          backgroundColor: piece.color,
        },
        styles.piece,
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  field: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piece: {
    position: 'absolute',
  },
})
