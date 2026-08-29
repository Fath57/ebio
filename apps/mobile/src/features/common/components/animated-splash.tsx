import * as React from 'react'
import { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, fonts } from '../../../theme/theme'
import { BRAND_LOGO } from '../../../utils/app-variant'

const { width, height } = Dimensions.get('window')

/**
 * The three leaves drift in from off-screen while the logo lands, each on its
 * own delay and trajectory, then keep a slow float until the global fade.
 * Artwork generated in the brand style (gpt-image), layered here — an
 * animation no still asset could carry by itself.
 */
const LEAVES = [
  {
    source: require('../../../../assets/splash/splash-leaf-1.png'),
    size: width * 0.20,
    to: { x: width * 0.13, y: height * 0.20 },
    rotate: ['-40deg', '-12deg'] as [string, string],
    delay: 0,
  },
  {
    source: require('../../../../assets/splash/splash-leaf-2.png'),
    size: width * 0.15,
    to: { x: width * 0.72, y: height * 0.26 },
    rotate: ['35deg', '10deg'] as [string, string],
    delay: 140,
  },
  {
    source: require('../../../../assets/splash/splash-leaf-3.png'),
    size: width * 0.17,
    to: { x: width * 0.60, y: height * 0.68 },
    rotate: ['-25deg', '18deg'] as [string, string],
    delay: 260,
  },
]

function FloatingLeaf({ leaf }: { leaf: (typeof LEAVES)[number] }) {
  const progress = useRef(new Animated.Value(0)).current
  const float = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.delay(leaf.delay),
      Animated.spring(progress, {
        toValue: 1,
        tension: 26,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start()
    // Gentle endless float; unmount stops it with the splash.
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    ).start()
  }, [progress, float, leaf.delay])

  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }),
    float.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
  )

  return (
    <Animated.Image
      source={leaf.source}
      resizeMode="contain"
      style={{
        position: 'absolute',
        left: leaf.to.x - leaf.size / 2,
        top: leaf.to.y - leaf.size / 2,
        width: leaf.size,
        height: leaf.size,
        opacity: progress,
        transform: [
          { translateY },
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: leaf.rotate }) },
        ],
      }}
    />
  )
}

interface AnimatedSplashProps {
  onFinish: () => void
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const logoScale = useRef(new Animated.Value(0.3)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const taglineOpacity = useRef(new Animated.Value(0)).current
  const lineWidth = useRef(new Animated.Value(0)).current
  const screenOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.sequence([
      // 1. Logo fades in + scales up
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 40,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // 2. Accent line expands
      Animated.timing(lineWidth, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
      // 3. Tagline fades in
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      // 4. Hold
      Animated.delay(600),
      // 5. Fade out everything
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => onFinish())
  }, [logoScale, logoOpacity, taglineOpacity, lineWidth, screenOpacity, onFinish])

  const animatedLineWidth = lineWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 48],
  })

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      {LEAVES.map(leaf => (
        <FloatingLeaf key={leaf.to.x} leaf={leaf} />
      ))}

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <Image
          source={BRAND_LOGO}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Accent line */}
      <View style={styles.lineContainer}>
        <Animated.View
          style={[
            styles.accentLine,
            { width: animatedLineWidth },
          ]}
        />
      </View>

      {/* Tagline */}
      <Animated.Text
        style={[styles.tagline, { opacity: taglineOpacity }]}
      >
        Produits bio, près de chez vous
      </Animated.Text>

      {/* Version */}
      <Text style={styles.version}>v1.0.0</Text>
    </Animated.View>
  )
}

const LOGO_SIZE = width * 0.30

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  logoContainer: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  lineContainer: {
    height: 4,
    marginTop: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  accentLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.green[400],
  },
  tagline: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
    color: colors.green[600],
    letterSpacing: 0.3,
  },
  version: {
    position: 'absolute',
    bottom: 40,
    fontFamily: fonts.sansMd,
    fontSize: 12,
    color: colors.neutral[200],
  },
})
