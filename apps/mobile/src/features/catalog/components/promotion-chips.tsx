import type { StyleProp, ViewStyle } from 'react-native'
import * as React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'

interface PromotionChipsProps {
  labels: string[]
  /** Solid chips for use over a photo (default: soft green pills). */
  overlay?: boolean
  /**
   * Nombre de puces tenant sur une seule ligne ; le reste est résumé par un
   * « +2 ». À renseigner dans toute liste de cartes : sans lui, les puces
   * passent à la ligne et le produit qui cumule les promotions dépasse ses
   * voisines, qui n'ont alors plus la même hauteur.
   */
  maxVisible?: number
  style?: StyleProp<ViewStyle>
}

/** "1+1" / "Livraison offerte" chips next to a product's price or photo. */
export function PromotionChips({ labels, overlay = false, maxVisible, style }: PromotionChipsProps) {
  if (labels.length === 0) {
    return null
  }
  const visible = maxVisible === undefined ? labels : labels.slice(0, maxVisible)
  const remaining = labels.length - visible.length
  return (
    <View style={[styles.row, maxVisible !== undefined && styles.rowSingleLine, style]}>
      {visible.map(label => (
        <View key={label} style={[styles.chip, overlay && styles.chipOverlay]}>
          <Text style={[styles.chipText, overlay && styles.chipTextOverlay]}>{label}</Text>
        </View>
      ))}
      {remaining > 0 && (
        <View style={[styles.chip, overlay && styles.chipOverlay]}>
          <Text style={[styles.chipText, overlay && styles.chipTextOverlay]}>
            +
            {remaining}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  rowSingleLine: {
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },
  chip: {
    backgroundColor: colors.green[50],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  chipOverlay: {
    backgroundColor: colors.green[600],
  },
  chipText: {
    fontFamily: fonts.sansSb,
    fontSize: 9,
    color: colors.green[800],
    letterSpacing: 0.2,
  },
  chipTextOverlay: {
    color: colors.neutral[0],
  },
})
