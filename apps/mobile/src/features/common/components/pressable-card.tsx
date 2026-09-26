import type { PressableProps, StyleProp, ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import * as React from 'react'
import { useRef } from 'react'
import { Animated, Pressable } from 'react-native'

interface PressableCardProps extends Omit<PressableProps, 'style'> {
  /** How far it sinks. A card takes less than a button: it is wider. */
  scaleTo?: number
  /**
   * A tick under the finger, for a press that changes something — adding to
   * the basket, keeping a product. Navigating somewhere does not deserve one:
   * a phone that buzzes at every tap is a phone one turns off.
   */
  haptic?: boolean
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

/**
 * A card that answers the finger.
 *
 * The default touchable flashes its opacity — cheap, and read as such. A card
 * that sinks under the thumb and springs back reads as a physical thing, which
 * is most of what separates an app that feels finished from one that does not.
 *
 * The spring is deliberately quick and barely bouncy: past that it stops being
 * a response and becomes a show.
 */
export function PressableCard({
  scaleTo = 0.975,
  haptic = false,
  style,
  children,
  onPress,
  ...props
}: PressableCardProps) {
  const scale = useRef(new Animated.Value(1)).current

  return (
    <Pressable
      onPressIn={() => {
        Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 3 }).start()
      }}
      onPressOut={() => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 5 }).start()
      }}
      onPress={(event) => {
        if (haptic) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }
        onPress?.(event)
      }}
      {...props}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  )
}
