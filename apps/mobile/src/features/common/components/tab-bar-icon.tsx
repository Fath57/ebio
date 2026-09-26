import type { ComponentType } from 'react'
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { colors } from '../../../theme/theme'

/** Quick and barely bouncy: a tab bar one uses fifty times a day. */
const SPRING = { damping: 14, stiffness: 320, mass: 0.5 }

interface TabBarIconProps {
  Icon: ComponentType<{ size: number, color: string, strokeWidth?: number }>
  size: number
  color: string
  focused: boolean
}

/**
 * The tab one is on, said by movement rather than by colour alone.
 *
 * Both directions animate, which is the whole point: the icon being left
 * settles back down while the new one lifts, so the eye follows a handover
 * instead of registering two separate changes. The dot used to appear and
 * vanish outright — a pop, at the exact moment attention was on it.
 *
 * Shared by the three apps. The courier and the supplier had no animation at
 * all, only a stroke that thickened.
 */
export function TabBarIcon({ Icon, size, color, focused }: TabBarIconProps) {
  const reduced = useReducedMotion()
  const progress = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    const target = focused ? 1 : 0
    progress.value = reduced
      ? withTiming(target, { duration: 0 })
      : withSpring(target, SPRING)
  }, [focused, progress, reduced])

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + progress.value * 0.14 },
      // A slight lift, so the active tab reads as raised rather than bigger.
      { translateY: -progress.value * 2 },
    ],
  }))

  const dotStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
  }))

  return (
    <View style={styles.wrapper}>
      <Animated.View style={iconStyle}>
        <Icon size={size} color={color} strokeWidth={focused ? 2.5 : 1.8} />
      </Animated.View>
      <Animated.View style={[styles.dot, dotStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.green[400],
    marginTop: 3,
  },
})
