import type { SearchResult } from '../hooks/use-search'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import Star from 'lucide-react-native/dist/esm/icons/star'
import Store from 'lucide-react-native/dist/esm/icons/store'
import * as React from 'react'
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors, fonts, radius, shadows, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ScalePressable } from '../../../utils/animations'

interface SearchResultCardProps {
  item: SearchResult
  onPress: (supplierId: string) => void
}

export function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

export function formatDistance(meters: number): string {
  const km = meters / 1000
  if (km < 1)
    return `${Math.round(meters)} m`
  return `${km.toFixed(1)} km`
}

export function SearchResultCard({ item, onPress }: SearchResultCardProps) {
  const { semantic } = useTheme()
  const { supplier, product } = item
  const hasPromo = product.promotionalPrice !== null
  const displayPrice = hasPromo ? product.promotionalPrice! : product.pricePerUnit

  return (
    <ScalePressable
      style={[styles.card, { backgroundColor: semantic.bgCard }]}
      onPress={() => onPress(supplier.id)}
      accessibilityRole="button"
      accessibilityLabel={`${product.name} chez ${supplier.shopName}`}
    >
      {/* Image 16:10 */}
      <View style={styles.imageContainer}>
        {product.photo
          ? (
              <Image
                source={{ uri: product.thumbnail ?? product.photo }}
                style={styles.image}
                resizeMode="cover"
              />
            )
          : (
              <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: semantic.bgSurface }]}>
                <Text style={[styles.placeholderLetter, { color: semantic.textTertiary }]}>
                  {product.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

        {/* Promo banner — bottom of image */}
        {hasPromo && (
          <View style={styles.promoBanner}>
            <Text style={styles.promoBannerText}>
              -
              {Math.round((1 - product.promotionalPrice! / product.pricePerUnit) * 100)}
              %
            </Text>
          </View>
        )}

        {/* Out of stock overlay */}
        {!product.inStock && (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>Indisponible</Text>
          </View>
        )}

        {/* Delivery time badge — top right */}
        {supplier.isOpen && (
          <View style={styles.timeBadge}>
            <Clock size={10} color={colors.neutral[800]} strokeWidth={2.5} />
            <Text style={styles.timeBadgeText}>15-30 min</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.body}>
        {/* Row 1: Product name + rating — the product is what the buyer scans for */}
        <View style={styles.titleRow}>
          <Text
            style={[styles.productName, { color: semantic.textPrimary }]}
            numberOfLines={1}
          >
            {product.name}
          </Text>
          {supplier.rating !== null && (
            <View style={styles.ratingPill}>
              <Star size={10} color={colors.earth[400]} fill={colors.earth[400]} strokeWidth={0} />
              <Text style={styles.ratingText}>{supplier.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>

        {/* Row 2: Shop name */}
        <View style={styles.shopRow}>
          <Store size={12} color={semantic.textTertiary} strokeWidth={2.2} />
          <Text
            style={[styles.shopName, { color: semantic.textSecondary }]}
            numberOfLines={1}
          >
            {supplier.shopName}
          </Text>
        </View>

        {/* Row 3: Meta line — distance · price · mode */}
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: semantic.textTertiary }]}>
            {formatDistance(supplier.distance)}
          </Text>
          <Text style={[styles.metaDot, { color: semantic.textTertiary }]}> · </Text>
          <Text style={[styles.priceText, hasPromo && styles.pricePromo]}>
            {formatPrice(displayPrice)}
            {' '}
            FCFA
          </Text>
          {hasPromo && (
            <Text style={[styles.priceOld, { color: semantic.textTertiary }]}>
              {formatPrice(product.pricePerUnit)}
            </Text>
          )}
          <Text style={[styles.metaDot, { color: semantic.textTertiary }]}> · </Text>
          {supplier.mode === 'ORDER'
            ? <Text style={styles.modeOrder}>Commander</Text>
            : <Text style={[styles.modeContact, { color: semantic.textTertiary }]}>Contacter</Text>}
        </View>

        {/* Row 4: Badges / note — toujours rendue (hauteur réservée) pour des cartes de hauteur égale */}
        <View style={styles.badgeRow}>
          {supplier.badges.includes('VALIDATED') && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Validé eBio</Text>
            </View>
          )}
          {supplier.badges.includes('TOP_SELLER') && (
            <View style={[styles.badge, { backgroundColor: colors.earth[50] }]}>
              <Text style={[styles.badgeText, { color: colors.earth[600] }]}>Top vendeur</Text>
            </View>
          )}
          {supplier.rating !== null && (
            <View style={styles.starsRow}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  size={10}
                  color={i < Math.round(supplier.rating!) ? colors.earth[400] : colors.neutral[200]}
                  fill={i < Math.round(supplier.rating!) ? colors.earth[400] : 'none'}
                  strokeWidth={0}
                />
              ))}
              <Text style={[styles.reviewCount, { color: semantic.textTertiary }]}>
                (
                {supplier.reviewCount}
                )
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing[4],
    ...shadows.sm,
  },

  // Image
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderLetter: {
    fontFamily: fonts.display,
    fontSize: 40,
  },

  // Image overlays
  promoBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    backgroundColor: colors.coral[400],
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderTopRightRadius: radius.md,
  },
  promoBannerText: {
    fontFamily: fonts.sansBd,
    fontSize: 12,
    color: colors.neutral[0],
    letterSpacing: 0.3,
  },
  outOfStockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  outOfStockText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.neutral[0],
  },
  timeBadge: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.neutral[0],
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  timeBadgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
    color: colors.neutral[800],
  },

  // Body
  body: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    gap: spacing[1],
  },

  // Title row
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  productName: {
    fontFamily: fonts.sansBd,
    fontSize: 17,
    lineHeight: 17 * 1.3,
    flex: 1,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.earth[50],
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ratingText: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
    color: colors.neutral[800],
  },

  // Product
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shopName: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 13 * 1.4,
    flexShrink: 1,
  },

  // Meta
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 12 * 1.4,
  },
  metaDot: {
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  priceText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.green[600],
  },
  pricePromo: {
    color: colors.coral[400],
  },
  priceOld: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textDecorationLine: 'line-through',
    marginLeft: 4,
  },
  modeOrder: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    color: colors.green[400],
  },
  modeContact: {
    fontFamily: fonts.sans,
    fontSize: 11,
  },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: 2,
    minHeight: 18, // Hauteur réservée même sans badge/note → cartes alignées
  },
  badge: {
    backgroundColor: colors.green[50],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 9,
    color: colors.green[800],
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  reviewCount: {
    fontFamily: fonts.sans,
    fontSize: 10,
    marginLeft: 3,
  },
})
