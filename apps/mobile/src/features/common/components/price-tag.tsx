import type { TextStyle } from 'react-native'
import * as React from 'react'
import { StyleSheet, Text } from 'react-native'
import { colors, fonts } from '../../../theme/theme'

interface PriceTagProps {
  amount: number
  unit: string
  size?: 'sm' | 'md' | 'lg'
  promotional?: boolean
  style?: TextStyle
}

const sizes = { sm: 13, md: 16, lg: 20 }

export function PriceTag({ amount, unit, size = 'md', promotional = false, style }: PriceTagProps) {
  const formatted = amount.toLocaleString('fr-FR')

  return (
    <Text
      style={[
        styles.price,
        { fontSize: sizes[size] },
        promotional && styles.promotional,
        style,
      ]}
    >
      {formatted}
      {' '}
      FCFA /
      {unit}
    </Text>
  )
}

const styles = StyleSheet.create({
  price: {
    fontFamily: fonts.mono,
    color: colors.green[600],
    letterSpacing: 0,
  },
  promotional: {
    textDecorationLine: 'line-through',
    color: colors.neutral[400],
  },
})
