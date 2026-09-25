import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useAssistantIdentity } from '../identity'

/** How many waves. Three carry the movement; five blur it. */
const RINGS = [0, 1, 2]

const RING_DURATION_MS = 2200

interface AssistantSpeakingProps {
  /** True only while sound is actually coming out. */
  speaking: boolean
}

/**
 * What you see while she is speaking.
 *
 * The spec refused "the animated sphere and the decorative sound wave", and it
 * was right in principle: anything that moves without saying something pulls
 * attention away from the cart and the total. This one says something — it
 * exists only while sound is coming out, and vanishes the second it stops. It
 * is the visual equivalent of seeing someone's lips move: you know to listen,
 * and you know when it is over.
 *
 * The waves leave the avatar, staggered in time, and fade as they widen.
 * Nothing blinks, nothing spins: a voice carries and dies away, and that is
 * what the drawing imitates.
 */
export function AssistantSpeaking({ speaking }: AssistantSpeakingProps) {
  const assistant = useAssistantIdentity()
  const waves = useRef(RINGS.map(() => new Animated.Value(0))).current

  useEffect(() => {
    if (!speaking) {
      waves.forEach(wave => wave.setValue(0))
      return
    }

    const loops = waves.map((wave, index) => Animated.loop(
      Animated.sequence([
        // The stagger between waves is what gives depth: without it the three
        // circles would read as one.
        Animated.delay((index * RING_DURATION_MS) / RINGS.length),
        Animated.timing(wave, {
          toValue: 1,
          duration: RING_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ))
    loops.forEach(loop => loop.start())

    return () => {
      loops.forEach(loop => loop.stop())
    }
  }, [speaking, waves])

  if (!speaking) {
    return null
  }

  return (
    <View style={styles.row}>
      <View style={styles.avatarWrap}>
        {waves.map((wave, index) => (
          <Animated.View
            key={RINGS[index]}
            pointerEvents="none"
            style={[styles.wave, {
              opacity: wave.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.38, 0] }),
              transform: [{ scale: wave.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
            }]}
          />
        ))}
        <Image source={assistant.avatar} style={styles.avatar} accessible={false} />
      </View>

      <Text style={styles.label}>
        {assistant.name}
        {' vous répond…'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingVertical: spacing[3],
  },
  avatarWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.green[400],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[600],
  },
})
