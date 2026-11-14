import type { SearchResult } from '../hooks/use-search'
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
import { PromotionChips } from '../../catalog/components/promotion-chips'
import { unitShortLabel } from '../../catalog/hooks/use-product-units'
import { promotionChipLabels } from '../../catalog/promotions'
import { ExportChip } from '../../terroir/components/valise-ui'
import { useProductExportability } from '../../terroir/exportability'
import { useShoppingMoney } from '../../terroir/hooks/use-shopping-money'
import { useValiseMode } from '../../terroir/valise-mode-context'

interface SearchResultCardProps {
  item: SearchResult
  /**
   * La carte montre un produit : elle annonce les deux identifiants et laisse
   * l'écran appelant décider où il emmène.
   */
  onPress: (productId: string, supplierId: string) => void
  /**
   * `grid` is the half-width card of the search results: one full-width card
   * per screen left room for a single product, which is no way to compare.
   */
  variant?: 'full' | 'grid'
}

export function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

export function formatDistance(meters: number): string {
  const km = meters / 1000
  if (km < 1)
    return `${Math.round(meters)} m`
  return `${km.toFixed(1).replace('.', ',')} km`
}

export function SearchResultCard({ item, onPress, variant = 'full' }: SearchResultCardProps) {
  const { semantic } = useTheme()
  const formatMoney = useShoppingMoney()
  const { supplier, product } = item
  // Valise mode: whether this product travels; null while the mode is off.
  const exportability = useProductExportability(product.id)
  // Shopping from abroad, the shop's distance to the phone means nothing.
  const { active: valise } = useValiseMode()
  const isGrid = variant === 'grid'
  const hasPromo = product.promotionalPrice !== null
  const displayPrice = hasPromo ? product.promotionalPrice! : product.pricePerUnit
  const chipLabels = promotionChipLabels(product.promotionTypes ?? [])
  const price = formatMoney(displayPrice)
  // The product's own rating, published from three reviews. The shop's rating
  // used to stand here, read as if it were the product's.
  const rating = product.ratingAvg ?? null
  const isValidated = supplier.badges.includes('VALIDATED')

  return (
    <ScalePressable
      style={[styles.card, { backgroundColor: semantic.bgCard }]}
      onPress={() => onPress(product.id, supplier.id)}
      accessibilityRole="button"
      accessibilityLabel={`${product.name} chez ${supplier.shopName}, ${price.primary} par ${unitShortLabel(product.unit)}${price.secondary ? `, soit ${price.secondary}` : ''}`}
    >
      <View style={styles.imageContainer}>
        {product.photo
          ? (
              <Image
                source={{ uri: product.thumbnail ?? product.photo }}
                style={styles.image}
                resizeMode="contain"
              />
            )
          : (
              <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: semantic.bgSurface }]}>
                <Text style={[styles.placeholderLetter, { color: semantic.textTertiary }]}>
                  {product.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

        {hasPromo && (
          <View style={styles.promoBanner}>
            <Text style={styles.promoBannerText}>
              {`-${Math.round((1 - product.promotionalPrice! / product.pricePerUnit) * 100)} %`}
            </Text>
          </View>
        )}

        {!product.inStock && (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>Indisponible</Text>
          </View>
        )}
      </View>

      <View style={[styles.body, isGrid && styles.bodyGrid]}>
        <Text
          style={[styles.productName, isGrid && styles.productNameGrid, { color: semantic.textPrimary }]}
          numberOfLines={isGrid ? 2 : 1}
        >
          {product.name}
        </Text>

        <View style={styles.shopRow}>
          <Store size={12} color={semantic.textTertiary} strokeWidth={2.2} />
          <Text style={[styles.shopName, { color: semantic.textSecondary }]} numberOfLines={1}>
            {supplier.shopName}
          </Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.priceText, isGrid && styles.priceTextGrid, hasPromo && styles.pricePromo]}>
            {price.primary}
          </Text>
          <Text style={[styles.priceUnit, { color: semantic.textSecondary }]}>
            {` / ${unitShortLabel(product.unit)}`}
          </Text>
          {hasPromo && (
            <Text style={[styles.priceOld, { color: semantic.textTertiary }]}>
              {formatMoney(product.pricePerUnit).amount}
            </Text>
          )}
        </View>
        {price.secondary && (
          <Text style={[styles.priceSecondary, { color: semantic.textSecondary }]} numberOfLines={1}>
            {price.secondary}
          </Text>
        )}

        <View style={styles.metaRow}>
          {!valise && (
            <Text style={[styles.metaText, { color: semantic.textSecondary }]}>
              {formatDistance(supplier.distance)}
            </Text>
          )}
          {rating !== null && (
            <View style={styles.ratingRow} accessibilityLabel={`Noté ${rating.toFixed(1)} sur 5`}>
              <Star size={12} color={colors.earth[400]} fill={colors.earth[400]} strokeWidth={0} />
              <Text style={[styles.metaText, { color: semantic.textPrimary }]}>
                {rating.toFixed(1).replace('.', ',')}
              </Text>
              {!isGrid && (
                <Text style={[styles.metaText, { color: semantic.textSecondary }]}>
                  {`(${product.ratingCount ?? 0})`}
                </Text>
              )}
            </View>
          )}
          {/* Ordering online is the rule; only the exception is worth a word. */}
          {supplier.mode === 'CONTACT' && (
            <Text style={[styles.metaText, { color: semantic.textSecondary }]}>Sur contact</Text>
          )}
        </View>

        {exportability && (
          <View style={styles.exportRow}>
            <ExportChip item={exportability} />
          </View>
        )}

        {(isValidated || chipLabels.length > 0 || (!isGrid && supplier.badges.includes('TOP_SELLER'))) && (
          <View style={styles.badgeRow}>
            {isValidated && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Validé eBio</Text>
              </View>
            )}
            {!isGrid && supplier.badges.includes('TOP_SELLER') && (
              <View style={[styles.badge, { backgroundColor: colors.earth[50] }]}>
                <Text style={[styles.badgeText, { color: colors.earth[800] }]}>Top vendeur</Text>
              </View>
            )}
            <PromotionChips labels={chipLabels} maxVisible={isGrid ? 1 : 2} />
          </View>
        )}
      </View>
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  // The charter's product image: 4:3, whole photo shown on white.
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 3,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.neutral[0],
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderLetter: {
    fontFamily: fonts.display,
    fontSize: 40,
  },
  // Promotions in earth, the charter's secondary: coral is for errors only.
  promoBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    backgroundColor: colors.earth[600],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderTopRightRadius: radius.sm,
  },
  promoBannerText: {
    fontFamily: fonts.sansBd,
    fontSize: 12,
    color: colors.neutral[0],
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
  body: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    gap: spacing[1],
  },
  bodyGrid: {
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
  },
  productName: {
    fontFamily: fonts.sansBd,
    fontSize: 17,
    lineHeight: 17 * 1.3,
  },
  productNameGrid: {
    fontSize: 15,
    lineHeight: 15 * 1.3,
    minHeight: 15 * 1.3 * 2,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  shopName: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 13 * 1.4,
    flexShrink: 1,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  priceText: {
    fontFamily: fonts.mono,
    fontSize: 15,
    color: colors.green[600],
  },
  priceTextGrid: {
    fontSize: 14,
  },
  pricePromo: {
    color: colors.earth[600],
  },
  priceUnit: {
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  priceSecondary: {
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  priceOld: {
    fontFamily: fonts.mono,
    fontSize: 12,
    textDecorationLine: 'line-through',
    marginLeft: spacing[2],
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing[3],
  },
  metaText: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
    lineHeight: 12 * 1.4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  exportRow: {
    marginTop: spacing[1],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: spacing[1],
  },
  badge: {
    backgroundColor: colors.green[50],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    minHeight: 22,
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    color: colors.green[800],
  },
})
