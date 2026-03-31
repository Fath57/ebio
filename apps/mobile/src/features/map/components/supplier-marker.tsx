import * as React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius } from '../../../theme/theme'

interface SupplierMarkerProps {
  shopName: string
  isValidated: boolean
  isOpen: boolean
}

export function SupplierMarker({
  shopName,
  isValidated,
  isOpen,
}: SupplierMarkerProps) {
  return (
    <View
      style={[styles.marker, isOpen ? styles.markerOpen : styles.markerClosed]}
    >
      <Text style={styles.label} numberOfLines={1}>
        {shopName}
      </Text>
      {isValidated && <View style={styles.validatedDot} />}
    </View>
  )
}

const styles = StyleSheet.create({
  marker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.neutral[0],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  markerOpen: {
    borderColor: colors.green[400],
  },
  markerClosed: {
    borderColor: colors.neutral[400],
  },
  label: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
    color: colors.neutral[800],
    maxWidth: 100,
  },
  validatedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green[400],
  },
})
