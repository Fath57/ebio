import Sparkles from 'lucide-react-native/dist/esm/icons/sparkles'
import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { colors, radius } from '../../../theme/theme'

interface AssistantEntryIconProps {
  size?: number
  color?: string
}

/**
 * L'étincelle qui mène à l'assistant, et qui bouge juste assez pour être vue.
 *
 * Une entrée nouvelle ne se trouve pas toute seule au milieu d'une barre déjà
 * pleine. Le halo part lentement, toutes les quatre secondes : assez pour que
 * l'œil l'attrape en passant, assez rare pour qu'on l'oublie ensuite. Rien ne
 * tourne, rien ne clignote — la charte ne veut pas d'un élément qui s'agite
 * sans rien dire, et celui-ci dit « il y a quelque chose ici ».
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
        // Le temps mort fait tout : sans lui, ce serait un clignotant.
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
