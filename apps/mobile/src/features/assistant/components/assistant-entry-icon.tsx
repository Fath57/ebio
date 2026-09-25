import Sparkles from 'lucide-react-native/dist/esm/icons/sparkles'
import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { colors, radius } from '../../../theme/theme'

interface AssistantEntryIconProps {
  size?: number
  color?: string
}

/**
 * The spark that leads to Assita, moving just enough to be noticed.
 *
 * A new entry point does not find itself in the middle of an already crowded
 * bar. The halo leaves slowly, every four seconds: enough for the eye to catch
 * it in passing, rare enough to be forgotten afterwards. Nothing spins,
 * nothing blinks — the charter does not want an element fidgeting for no
 * reason, and this one says "there is something here".
 */
export function AssistantEntryIcon({ size = 20, color = colors.green[600] }: AssistantEntryIconProps) {
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // The dead time is what makes it: without it this would be a blinker.
        Animated.delay(2600),
      ]),
    )
    loop.start()

    return () => {
      loop.stop()
    }
  }, [pulse])

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, {
          opacity: pulse.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.35, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.7] }) }],
        }]}
      />
      <Animated.View
        style={{
          transform: [{
            scale: pulse.interpolate({ inputRange: [0, 0.25, 0.6, 1], outputRange: [1, 1.12, 1, 1] }),
          }],
        }}
      >
        <Sparkles size={size} color={color} strokeWidth={2.2} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.green[400],
  },
})
