import * as React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius } from '../../../theme/theme'

type BadgeVariant = 'VALIDATED' | 'TOP_SELLER' | 'CERTIFIED_BIO'

interface BadgeProps {
  variant: BadgeVariant
  label?: string
}

const BADGE_CONFIG: Record<BadgeVariant, {
  backgroundColor: string
  textColor: string
  borderColor: string
  defaultLabel: string
}> = {
  VALIDATED: {
    backgroundColor: colors.green[50],
    textColor: colors.green[800],
    borderColor: colors.green[200],
    defaultLabel: 'Validé eBio',
  },
  TOP_SELLER: {
    backgroundColor: colors.earth[50],
    textColor: colors.earth[800],
    borderColor: colors.earth[200],
    defaultLabel: 'Top Vendeur',
  },
  CERTIFIED_BIO: {
    backgroundColor: colors.sky[50],
    textColor: colors.sky[800],
    borderColor: colors.sky[100],
    defaultLabel: 'Certifié Bio',
  },
}

export function Badge({ variant, label }: BadgeProps) {
  const config = BADGE_CONFIG[variant]

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label ?? config.defaultLabel}
    >
      <Text style={[styles.text, { color: config.textColor }]}>
        {label ?? config.defaultLabel}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    height: 22,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  text: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
})
