import NetInfo from '@react-native-community/netinfo'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, spacing } from '../../../theme/theme'

export function ConnectivityBanner() {
  const insets = useSafeAreaInsets()
  const [isConnected, setIsConnected] = useState(true)
  const [slideAnim] = useState(new Animated.Value(-50))

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true
      setIsConnected(connected)

      Animated.timing(slideAnim, {
        toValue: connected ? -50 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start()
    })

    return unsubscribe
  }, [slideAnim])

  if (isConnected)
    return null

  return (
    <Animated.View style={[styles.banner, { paddingTop: insets.top, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.dot} />
      <Text style={styles.text}>En attente de connexion</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.earth[400],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutral[0],
    marginRight: spacing[2],
  },
  text: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[0],
  },
})
