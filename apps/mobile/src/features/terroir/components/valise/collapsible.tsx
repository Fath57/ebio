import type { ReactNode } from 'react'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1)
const DURATION_MS = 260

interface CollapsibleProps {
  expanded: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}

/**
 * Unfolds its content: the height follows the measured content (so text
 * scaling is right), the content fades in behind it. Height animates on
 * purpose here: a rare, user-triggered unfold where the page below must
 * follow. Reduced motion: no animation, it simply appears.
 *
 * Folded, the content is neither touchable nor read by screen readers.
 */
export function Collapsible({ expanded, style, children }: CollapsibleProps) {
  const reduced = useReducedMotion()
  const progress = useSharedValue(expanded ? 1 : 0)
  const contentHeight = useSharedValue(0)

  useEffect(() => {
    progress.set(withTiming(expanded ? 1 : 0, { duration: reduced ? 0 : DURATION_MS, easing: EASE_IN_OUT }))
  }, [expanded, reduced, progress])

  const onLayout = (event: LayoutChangeEvent): void => {
    contentHeight.set(event.nativeEvent.layout.height)
  }

  const containerStyle = useAnimatedStyle(() => ({
    height: progress.get() * contentHeight.get(),
  }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
  }))

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      pointerEvents={expanded ? 'box-none' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View style={[styles.content, contentStyle]}>
        <View style={style} onLayout={onLayout}>
          {children}
        </View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
})
