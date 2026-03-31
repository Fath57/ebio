import * as React from 'react'
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'

interface NavigateButtonProps {
  latitude: number
  longitude: number
  label?: string
}

function buildMapsUrl(latitude: number, longitude: number, label: string): string {
  const encodedLabel = encodeURIComponent(label)
  if (Platform.OS === 'ios') {
    return `maps:0,0?q=${encodedLabel}&ll=${latitude},${longitude}`
  }
  return `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`
}

export function NavigateButton({ latitude, longitude, label = 'Destination' }: NavigateButtonProps) {
  async function handlePress(): Promise<void> {
    const url = buildMapsUrl(latitude, longitude, label)
    const canOpen = await Linking.canOpenURL(url)

    if (canOpen) {
      await Linking.openURL(url)
    }
    else {
      const fallback = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
      await Linking.openURL(fallback).catch(() => {
        Alert.alert('Erreur', 'Impossible d\u2019ouvrir la navigation.')
      })
    }
  }

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Naviguer vers le fournisseur"
    >
      <Text style={styles.text}>Y aller</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    backgroundColor: colors.earth[400],
    borderRadius: radius.md,
    paddingHorizontal: spacing[5],
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
})
