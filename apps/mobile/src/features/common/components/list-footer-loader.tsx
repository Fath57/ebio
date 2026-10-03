import * as React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { colors, spacing } from '../../../theme/theme'

/**
 * The foot of an infinitely scrolled list: a spinner while the next page
 * loads, nothing otherwise. Pass it as `ListFooterComponent`.
 */
export function ListFooterLoader({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) {
    return null
  }
  return (
    <View style={styles.footer} accessibilityLabel="Chargement de la suite">
      <ActivityIndicator color={colors.green[400]} />
    </View>
  )
}

const styles = StyleSheet.create({
  footer: {
    paddingVertical: spacing[5],
    alignItems: 'center',
  },
})
