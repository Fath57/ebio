import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { ASSISTANT_AVATAR } from '../avatar'

/** Le nombre d'ondes. Trois suffisent à donner le mouvement ; cinq brouillent. */
const RINGS = [0, 1, 2]

const RING_DURATION_MS = 2200

interface AssistantSpeakingProps {
  /** True only while sound is actually coming out. */
  speaking: boolean
}

/**
 * Ce qu'on voit quand elle parle.
 *
 * La spec refusait « la sphère animée et l'onde sonore décorative », et elle
 * avait raison sur le principe : ce qui bouge sans rien dire détourne du panier
 * et du total. Celle-ci dit quelque chose — elle n'existe que pendant que le
 * son sort, et disparaît à la seconde où il s'arrête. C'est l'équivalent visuel
 * de voir quelqu'un remuer les lèvres : on sait qu'il faut écouter, et on sait
 * quand c'est fini.
 *
 * Les ondes partent de l'avatar, décalées dans le temps, et s'effacent en
 * s'élargissant. Rien ne clignote, rien ne tourne : une voix porte loin et
 * s'éteint, c'est ce que le dessin imite.
 */
export function AssistantSpeaking({ speaking }: AssistantSpeakingProps) {
  const waves = useRef(RINGS.map(() => new Animated.Value(0))).current

  useEffect(() => {
    if (!speaking) {
      waves.forEach(wave => wave.setValue(0))
      return
    }

    const loops = waves.map((wave, index) => Animated.loop(
      Animated.sequence([
        // Le décalage entre les ondes fait la profondeur : sans lui, les trois
        // cercles n'en formeraient qu'un.
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
        <Image source={ASSISTANT_AVATAR} style={styles.avatar} accessible={false} />
      </View>

      <Text style={styles.label}>Elle vous répond…</Text>
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
