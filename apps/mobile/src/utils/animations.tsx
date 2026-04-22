import type { PressableProps, StyleProp, ViewStyle } from 'react-native'
import * as React from 'react'
import { useEffect, useRef } from 'react'
import {
  Animated,
  Pressable,

} from 'react-native'

// ─── Fade-in + slide up on mount ────────────────────────────────────────────
interface FadeInViewProps {
  delay?: number
  duration?: number
  slideDistance?: number
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

export function FadeInView({
  delay = 0,
  duration = 400,
  slideDistance = 20,
  style,
  children,
}: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(slideDistance)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacity, translateY, delay, duration])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  )
}

// ─── Scale-on-press wrapper ─────────────────────────────────────────────────
interface ScalePressableProps extends PressableProps {
  scaleValue?: number
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

export function ScalePressable({
  scaleValue = 0.96,
  style,
  children,
  ...props
}: ScalePressableProps) {
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: scaleValue,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start()
  }

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  )
}

// ─── Staggered list item wrapper ────────────────────────────────────────────
interface StaggerItemProps {
  index: number
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

export function StaggerItem({ index, children, style }: StaggerItemProps) {
  return (
    <FadeInView delay={index * 80} duration={350} slideDistance={16} style={style}>
      {children}
    </FadeInView>
  )
}

// ─── Pulse animation (for badges, dots) ─────────────────────────────────────
interface PulseViewProps {
  duration?: number
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

export function PulseView({ duration = 1500, style, children }: PulseViewProps) {
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.15,
          duration: duration / 2,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: duration / 2,
          useNativeDriver: true,
        }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [scale, duration])

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  )
}

// ─── Slide-in from side ─────────────────────────────────────────────────────
interface SlideInProps {
  from?: 'left' | 'right'
  delay?: number
  duration?: number
  distance?: number
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
}

export function SlideIn({
  from = 'right',
  delay = 0,
  duration = 350,
  distance = 40,
  style,
  children,
}: SlideInProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateX = useRef(new Animated.Value(from === 'right' ? distance : -distance)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        delay,
        useNativeDriver: true,
        speed: 14,
        bounciness: 4,
      }),
    ]).start()
  }, [opacity, translateX, delay, duration])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateX }] }]}>
      {children}
    </Animated.View>
  )
}
