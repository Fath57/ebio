import { useNavigationState } from '@react-navigation/native'
import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { colors } from '../../../theme/theme'

/** Wide enough to be a mark, narrow enough not to be a tab. */
const WIDTH = 26
const HEIGHT = 3

/** It should arrive with the screen, not after it. */
const SPRING = { damping: 18, stiffness: 240, mass: 0.6 }

/**
 * The mark that travels from one tab to the next.
 *
 * A dot that lit up here and went out there said which tab was active without
 * ever showing the move — two separate events, and the eye has nothing to
 * follow. One mark that slides says the same thing as a single gesture, which
 * is what makes a bar feel like an object rather than a set of buttons.
 *
 * Drawn through `tabBarBackground`, so the bar itself — its corners, its
 * shadow, its badges, its safe-area padding — is left exactly as it was.
 * Positions are computed from the bar's width divided by the number of tabs,
 * which is how the default bar lays them out.
 */
export function TabFocusIndicator() {
  const { width } = useWindowDimensions()
  const reduced = useReducedMotion()
  const index = useNavigationState(state => state.index)
  const count = useNavigationState(state => state.routes.length)

  const tabWidth = width / Math.max(count, 1)
  const target = index * tabWidth + (tabWidth - WIDTH) / 2
  const offset = useSharedValue(target)

  useEffect(() => {
    offset.value = reduced
      ? withTiming(target, { duration: 0 })
      : withSpring(target, SPRING)
  }, [offset, reduced, target])

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.mark, style]} />
    </View>
  )
}

const styles = StyleSheet.create({
  mark: {
    position: 'absolute',
    top: 0,
    width: WIDTH,
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    backgroundColor: colors.green[400],
  },
})
