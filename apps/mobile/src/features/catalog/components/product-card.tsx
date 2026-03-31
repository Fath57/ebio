import * as React from 'react'
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { ScalePressable } from '../../../utils/animations'

interface ProductCardProps {
  id: string
  name: string
  imageUrl: string | null
  pricePerUnit: number
  promotionalPrice: number | null
  unit: string
  isInStock: boolean
  onPress: (productId: string) => void
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

export function ProductCard({
  id,
  name,
  imageUrl,
  pricePerUnit,
  promotionalPrice,
  unit,
  isInStock,
  onPress,
}: ProductCardProps) {
  const hasPromo = promotionalPrice !== null && promotionalPrice < pricePerUnit
  const displayPrice = hasPromo ? promotionalPrice : pricePerUnit

  return (
    <ScalePressable
      style={styles.card}
      onPress={() => onPress(id)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${formatPrice(displayPrice)} FCFA par ${unit}`}
    >
      <View>
        {imageUrl
          ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="cover"
                accessibilityLabel={`Photo de ${name}`}
              />
            )
          : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Text style={styles.placeholderText}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
        {hasPromo && (
          <View style={styles.promoBadge}>
            <Text style={styles.promoText}>Promo</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
          {name}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatPrice(displayPrice)}
            {' '}
            FCFA /
            {unit}
          </Text>
          {hasPromo && (
            <Text style={styles.originalPrice}>
              {formatPrice(pricePerUnit)}
            </Text>
          )}
        </View>

        <View style={styles.stockRow}>
          <View
            style={[
              styles.stockDot,
              { backgroundColor: isInStock ? colors.green[400] : colors.coral[400] },
            ]}
          />
          <Text
            style={[
              styles.stockText,
              { color: isInStock ? colors.green[600] : colors.coral[600] },
            ]}
          >
            {isInStock ? 'En stock' : 'Rupture'}
          </Text>
        </View>
      </View>
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.neutral[0],
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  image: {
    width: '100%',
    height: 160,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  imagePlaceholder: {
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: fonts.sansBd,
    fontSize: 24,
    color: colors.neutral[400],
  },
  content: {
    padding: spacing[2],
    gap: spacing[1],
  },
  name: {
    ...typography.bodyS,
    color: colors.neutral[800],
    fontFamily: fonts.sansMd,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  price: {
    ...typography.price,
    color: colors.green[600],
  },
  originalPrice: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.neutral[400],
    textDecorationLine: 'line-through',
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stockText: {
    ...typography.caption,
  },
  promoBadge: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    backgroundColor: colors.coral[400],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  promoText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
    color: colors.neutral[0],
  },
})
