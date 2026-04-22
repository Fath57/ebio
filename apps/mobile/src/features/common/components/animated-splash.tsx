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

const { width } = Dimensions.get('window')

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
          source={require('../../../../assets/logo-transparent.png')}
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
    color: colors.neutral[300],
  },
})
