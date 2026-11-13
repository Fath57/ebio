import type { TextStyle } from 'react-native'
import * as React from 'react'
import { StyleSheet, Text } from 'react-native'
import { colors, fonts } from '../../../theme/theme'
import { unitShortLabel } from '../../catalog/hooks/use-product-units'
import { useMoney } from '../hooks/use-money'

interface PriceTagProps {
  amount: number
  unit: string
  size?: 'sm' | 'md' | 'lg'
  promotional?: boolean
  style?: TextStyle
}

const sizes = { sm: 13, md: 16, lg: 20 }

export function PriceTag({ amount, unit, size = 'md', promotional = false, style }: PriceTagProps) {
  const { formatMoney } = useMoney()
  const money = formatMoney(amount)

  return (
    <Text
      style={[
        styles.price,
        { fontSize: sizes[size] },
        promotional && styles.promotional,
        style,
      ]}
    >
      {`${money.primary} / ${unitShortLabel(unit)}`}
      {money.secondary ? <Text style={styles.secondary}>{`  ${money.secondary}`}</Text> : null}
    </Text>
  )
}

const styles = StyleSheet.create({
  price: {
    fontFamily: fonts.mono,
    color: colors.green[600],
    letterSpacing: 0,
  },
  secondary: {
    fontSize: 11,
    color: colors.neutral[600],
  },
  promotional: {
    textDecorationLine: 'line-through',
    color: colors.neutral[400],
  },
})
