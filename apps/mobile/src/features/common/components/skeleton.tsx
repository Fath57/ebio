import type { DimensionValue, ViewStyle } from 'react-native'
import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

/** Slow enough to read as breathing, not as flashing. */
const PULSE_MS = 900

interface SkeletonProps {
  width?: DimensionValue
  height?: number
  /** Defaults to the small radius; pass `radius.pill` for a line of text. */
  borderRadius?: number
  style?: ViewStyle
}

/**
 * The shape of what is coming, while it comes.
 *
 * A spinner on an empty screen reads as waiting; a block where the content
 * will be reads as loading. Nothing here is faster — it is the same request —
 * but the page stops jumping when the answer lands, because the space was
 * already taken.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = radius.sm, style }: SkeletonProps) {
  const { semantic } = useTheme()
  const pulse = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: PULSE_MS, useNativeDriver: true }),
      ]),
    )
    beat.start()
    return () => {
      beat.stop()
    }
  }, [pulse])

  return (
    <Animated.View
      // Decorative: a screen reader has nothing to say about a grey block.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius, backgroundColor: semantic.bgSurface, opacity: pulse },
        style,
      ]}
    />
  )
}

/**
 * A product card's outline: image, two lines, a price.
 *
 * Matches the real card's proportions, so the list does not shift when the
 * cards arrive.
 */
export function ProductCardSkeleton() {
  const { semantic } = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
      <Skeleton width={84} height={84} borderRadius={radius.md} />
      <View style={styles.lines}>
        <Skeleton width="70%" height={15} />
        <Skeleton width="45%" height={13} />
        <Skeleton width="35%" height={17} />
      </View>
    </View>
  )
}

/** As many outlines as the list will hold, without a key to invent. */
export function ProductCardSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, index) => index).map(index => (
        <ProductCardSkeleton key={`skeleton-${index}`} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
  },
  lines: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing[2],
  },
  list: {
    gap: spacing[3],
  },
})
