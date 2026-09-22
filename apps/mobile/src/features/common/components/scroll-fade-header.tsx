import type { ReactNode } from 'react'
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import * as React from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

/**
 * Header icon that follows the scroll: white over the photo, ink over the
 * page once the header has turned opaque. `fixedColor` opts out for a state
 * that carries its own meaning — a favourited heart stays coral throughout.
 *
 * Both copies are always rendered and cross-faded; at rest one of them sits
 * at opacity 0 and contributes nothing.
 */
export function HeaderIcon({
  Icon,
  tintProgress,
  fixedColor,
  fill,
}: {
  Icon: React.ComponentType<{ size: number, color: string, strokeWidth?: number, fill?: string }>
  tintProgress: Animated.AnimatedInterpolation<number>
  fixedColor?: string
  fill?: string
}) {
  if (fixedColor) {
    return (
      <View style={styles.icon}>
        <Icon size={20} color={fixedColor} fill={fill ?? 'none'} strokeWidth={2.2} />
      </View>
    )
  }
  return (
    <View style={styles.icon}>
      <Animated.View style={[styles.iconLayer, { opacity: Animated.subtract(1, tintProgress) }]}>
        <Icon size={20} color={colors.neutral[0]} fill={fill ?? 'none'} strokeWidth={2.2} />
      </Animated.View>
      <Animated.View style={[styles.iconLayer, { opacity: tintProgress }]}>
        <Icon size={20} color={colors.neutral[800]} fill={fill ?? 'none'} strokeWidth={2.2} />
      </Animated.View>
    </View>
  )
}

interface ScrollFadeHeaderProps {
  /** Where the photo stops and the page begins — drives the whole fade. */
  heroHeight: number
  scrollY: Animated.Value
  /** Appears with the background, once the photo is scrolled past. */
  title: string
  onBack: () => void
  /** Action buttons, built with `HeaderIcon` so they tint the same way. */
  rightSlot?: ReactNode
}

/**
 * The header that floats over a photo hero and turns into a solid bar as the
 * page scrolls under it.
 *
 * Shared rather than written twice: the supplier page used to put a plain
 * header *inside* its scroll view, so the back button scrolled away with the
 * cover and left no way out from the bottom of a long page. Same component
 * now means the same behaviour, the same icon sizes and the same tint on
 * every screen built this way.
 */
export function ScrollFadeHeader({ heroHeight, scrollY, title, onBack, rightSlot }: ScrollFadeHeaderProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()

  const background = scrollY.interpolate({
    inputRange: [heroHeight - 160, heroHeight - 80],
    outputRange: ['rgba(0,0,0,0)', semantic.bgPage],
    extrapolate: 'clamp',
  })
  const contentOpacity = scrollY.interpolate({
    inputRange: [heroHeight - 140, heroHeight - 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })

  return (
    <Animated.View
      style={[
        styles.header,
        { backgroundColor: background, paddingTop: insets.top },
      ]}
    >
      <Animated.View
        style={[styles.borderOverlay, { opacity: contentOpacity, borderBottomColor: semantic.borderLight }]}
        pointerEvents="none"
      />
      <Pressable
        style={styles.button}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Retour"
      >
        <HeaderIcon Icon={ArrowLeft} tintProgress={contentOpacity} />
      </Pressable>

      <Animated.Text
        numberOfLines={1}
        style={[styles.title, { color: semantic.textPrimary, opacity: contentOpacity }]}
      >
        {title}
      </Animated.Text>

      <View style={styles.right}>{rightSlot}</View>
    </Animated.View>
  )
}

/** The tint an action button should follow. Mirrors the header's own fade. */
export function useHeaderTint(heroHeight: number, scrollY: Animated.Value) {
  return scrollY.interpolate({
    inputRange: [heroHeight - 140, heroHeight - 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    gap: spacing[3],
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansSb,
    fontSize: 15,
    textAlign: 'center',
  },
  right: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20,20,16,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 20,
    height: 20,
  },
  iconLayer: {
    position: 'absolute',
  },
})
