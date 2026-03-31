import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import Heart from 'lucide-react-native/dist/esm/icons/heart'
import Info from 'lucide-react-native/dist/esm/icons/info'
import Leaf from 'lucide-react-native/dist/esm/icons/leaf'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Share2 from 'lucide-react-native/dist/esm/icons/share-2'
import ShoppingBag from 'lucide-react-native/dist/esm/icons/shopping-bag'
import Star from 'lucide-react-native/dist/esm/icons/star'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import Weight from 'lucide-react-native/dist/esm/icons/weight'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { formatDistance, formatPrice } from '../../search/components/search-result-card'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const HERO_HEIGHT = 340

interface ProductDetailScreenProps {
  product: {
    id: string
    name: string
    imageUrl: string | null
    pricePerUnit: number
    promotionalPrice: number | null
    unit: string
    isInStock: boolean
    categoryName?: string
    description?: string
    stock?: number
  }
  supplier: {
    id: string
    shopName: string
    rating: number | null
    distance: number
    mode: 'CONTACT' | 'ORDER'
    isValidated: boolean
    profilePhoto?: string | null
    reviewCount?: number
  }
  onGoBack: () => void
  onAddToCart: (productId: string, quantity: number) => void
  onNavigateToSupplier: (supplierId: string) => void
}

const UNIT_LABELS: Record<string, string> = {
  KG: 'le kilogramme',
  LITER: 'le litre',
  SACHET: 'le sachet',
  PIECE: 'la pièce',
  LOT: 'le lot',
  kg: 'le kilogramme',
  litre: 'le litre',
  sachet: 'le sachet',
  piece: 'la pièce',
  lot: 'le lot',
}

export function ProductDetailScreen({
  product,
  supplier,
  onGoBack,
  onAddToCart,
  onNavigateToSupplier,
}: ProductDetailScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const [quantity, setQuantity] = useState(1)
  const [isFavorite, setIsFavorite] = useState(false)
  const scrollY = useRef(new Animated.Value(0)).current

  const hasPromo = product.promotionalPrice !== null && product.promotionalPrice < product.pricePerUnit
  const displayPrice = hasPromo ? product.promotionalPrice! : product.pricePerUnit
  const totalPrice = displayPrice * quantity
  const discount = hasPromo ? Math.round((1 - product.promotionalPrice! / product.pricePerUnit) * 100) : 0
  const unitLabel = UNIT_LABELS[product.unit] ?? product.unit

  const handleDecrement = useCallback(() => {
    setQuantity(prev => Math.max(1, prev - 1))
  }, [])

  const handleIncrement = useCallback(() => {
    setQuantity(prev => Math.min(99, prev + 1))
  }, [])

  const handleAddToCart = useCallback(() => {
    if (product.isInStock) {
      onAddToCart(product.id, quantity)
    }
  }, [product.id, product.isInStock, quantity, onAddToCart])

  // Header opacity based on scroll
  const headerBg = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT - 100],
    outputRange: ['rgba(0,0,0,0)', semantic.bgPage],
    extrapolate: 'clamp',
  })

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      {/* Floating header */}
      <Animated.View style={[styles.floatingHeader, { backgroundColor: headerBg, paddingTop: insets.top }]}>
        <Pressable
          style={styles.headerButton}
          onPress={onGoBack}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.neutral[0]} strokeWidth={2.5} />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerButton}
            onPress={() => setIsFavorite(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Heart
              size={22}
              color={isFavorite ? colors.coral[400] : colors.neutral[0]}
              fill={isFavorite ? colors.coral[400] : 'none'}
              strokeWidth={2}
            />
          </Pressable>
          <Pressable
            style={styles.headerButton}
            onPress={() => {}}
            accessibilityRole="button"
            accessibilityLabel="Partager"
          >
            <Share2 size={20} color={colors.neutral[0]} strokeWidth={2} />
          </Pressable>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
      >
        {/* ============================================================== */}
        {/* HERO IMAGE                                                      */}
        {/* ============================================================== */}
        <View style={styles.heroContainer}>
          {product.imageUrl
            ? (
                <Image
                  source={{ uri: product.imageUrl }}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
              )
            : (
                <View style={[styles.heroImage, styles.heroPlaceholder, { backgroundColor: semantic.bgSurface }]}>
                  <Text style={[styles.heroPlaceholderLetter, { color: semantic.textTertiary }]}>
                    {product.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

          {/* Gradient overlay bottom */}
          <View style={styles.heroGradient} />

          {/* Promo badge */}
          {hasPromo && (
            <View style={styles.heroPromoBadge}>
              <Text style={styles.heroPromoBadgeText}>-{discount}%</Text>
            </View>
          )}

          {/* Out of stock overlay */}
          {!product.isInStock && (
            <View style={styles.heroOutOfStock}>
              <Package size={32} color={colors.neutral[0]} strokeWidth={1.5} />
              <Text style={styles.heroOutOfStockText}>Indisponible</Text>
              <Text style={styles.heroOutOfStockSub}>Ce produit est temporairement en rupture</Text>
            </View>
          )}

          {/* Image counter dot indicators (placeholder for future multi-photo) */}
          <View style={styles.heroDotsRow}>
            <View style={[styles.heroDot, styles.heroDotActive]} />
            <View style={styles.heroDot} />
            <View style={styles.heroDot} />
          </View>
        </View>

        {/* ============================================================== */}
        {/* PRODUCT INFO                                                    */}
        {/* ============================================================== */}
        <View style={styles.infoSection}>
          {/* Category + Bio badge */}
          <View style={styles.tagRow}>
            {product.categoryName && (
              <View style={[styles.categoryPill, { backgroundColor: semantic.bgPrimaryLight }]}>
                <Text style={[styles.categoryPillText, { color: semantic.textPrimaryColor }]}>
                  {product.categoryName}
                </Text>
              </View>
            )}
            <View style={styles.bioPill}>
              <Leaf size={10} color={colors.green[600]} strokeWidth={2.5} />
              <Text style={styles.bioPillText}>Bio</Text>
            </View>
          </View>

          {/* Product name */}
          <Text style={[styles.productName, { color: semantic.textPrimary }]}>
            {product.name}
          </Text>

          {/* Price block */}
          <View style={styles.priceBlock}>
            <View style={styles.priceMainRow}>
              {hasPromo
                ? (
                    <>
                      <Text style={styles.pricePromo}>
                        {formatPrice(product.promotionalPrice!)}
                      </Text>
                      <Text style={styles.priceCurrency}> FCFA</Text>
                      <View style={styles.discountPill}>
                        <Text style={styles.discountPillText}>-{discount}%</Text>
                      </View>
                    </>
                  )
                : (
                    <>
                      <Text style={styles.priceCurrent}>
                        {formatPrice(product.pricePerUnit)}
                      </Text>
                      <Text style={styles.priceCurrency}> FCFA</Text>
                    </>
                  )}
            </View>
            {hasPromo && (
              <Text style={[styles.priceOld, { color: semantic.textTertiary }]}>
                {formatPrice(product.pricePerUnit)} FCFA
              </Text>
            )}
            <Text style={[styles.unitLabel, { color: semantic.textTertiary }]}>
              {unitLabel}
            </Text>
          </View>

          {/* Stock + unit info row */}
          <View style={styles.infoChipsRow}>
            <View style={[styles.infoChip, { backgroundColor: product.isInStock ? colors.green[50] : colors.coral[50] }]}>
              <View style={[styles.infoChipDot, { backgroundColor: product.isInStock ? colors.green[400] : colors.coral[400] }]} />
              <Text style={[styles.infoChipText, { color: product.isInStock ? colors.green[800] : colors.coral[600] }]}>
                {product.isInStock
                  ? product.stock !== undefined ? `${product.stock} en stock` : 'En stock'
                  : 'Rupture de stock'}
              </Text>
            </View>
            <View style={[styles.infoChip, { backgroundColor: semantic.bgSurface }]}>
              <Weight size={12} color={semantic.textSecondary} strokeWidth={2} />
              <Text style={[styles.infoChipText, { color: semantic.textSecondary }]}>
                {product.unit}
              </Text>
            </View>
          </View>
        </View>

        {/* ============================================================== */}
        {/* DESCRIPTION                                                     */}
        {/* ============================================================== */}
        {product.description && (
          <>
            <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Description</Text>
              <Text style={[styles.descriptionText, { color: semantic.textSecondary }]}>
                {product.description}
              </Text>
            </View>
          </>
        )}

        {/* ============================================================== */}
        {/* DÉTAILS PRODUIT                                                 */}
        {/* ============================================================== */}
        <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Détails</Text>
          <View style={[styles.detailsCard, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}>
            <DetailRow
              label="Catégorie"
              value={product.categoryName ?? '—'}
              semantic={semantic}
            />
            <View style={[styles.detailDivider, { backgroundColor: semantic.borderLight }]} />
            <DetailRow
              label="Unité de vente"
              value={product.unit}
              semantic={semantic}
            />
            <View style={[styles.detailDivider, { backgroundColor: semantic.borderLight }]} />
            <DetailRow
              label="Type"
              value="Biologique"
              semantic={semantic}
              icon={<Leaf size={14} color={colors.green[400]} strokeWidth={2} />}
            />
            <View style={[styles.detailDivider, { backgroundColor: semantic.borderLight }]} />
            <DetailRow
              label="Origine"
              value="Production locale"
              semantic={semantic}
            />
          </View>
        </View>

        {/* ============================================================== */}
        {/* FOURNISSEUR                                                     */}
        {/* ============================================================== */}
        <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Vendu par</Text>
          <TouchableOpacity
            style={[styles.supplierCard, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}
            onPress={() => onNavigateToSupplier(supplier.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Voir ${supplier.shopName}`}
          >
            {/* Supplier avatar */}
            {supplier.profilePhoto
              ? (
                  <Image source={{ uri: supplier.profilePhoto }} style={styles.supplierAvatar} />
                )
              : (
                  <View style={[styles.supplierAvatar, styles.supplierAvatarFallback]}>
                    <Text style={styles.supplierAvatarText}>
                      {supplier.shopName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

            <View style={styles.supplierInfo}>
              <View style={styles.supplierNameRow}>
                <Text style={[styles.supplierName, { color: semantic.textPrimary }]} numberOfLines={1}>
                  {supplier.shopName}
                </Text>
                {supplier.isValidated && (
                  <CircleCheck size={16} color={colors.green[400]} fill={colors.green[400]} strokeWidth={0} />
                )}
              </View>

              <View style={styles.supplierMeta}>
                {supplier.rating !== null && (
                  <View style={styles.metaItem}>
                    <Star size={12} color={colors.earth[400]} fill={colors.earth[400]} strokeWidth={0} />
                    <Text style={[styles.metaText, { color: semantic.textSecondary }]}>
                      {supplier.rating.toFixed(1)}
                    </Text>
                    {supplier.reviewCount !== undefined && (
                      <Text style={[styles.metaTextLight, { color: semantic.textTertiary }]}>
                        ({supplier.reviewCount})
                      </Text>
                    )}
                  </View>
                )}
                <View style={styles.metaItem}>
                  <MapPin size={12} color={semantic.textTertiary} strokeWidth={2} />
                  <Text style={[styles.metaText, { color: semantic.textSecondary }]}>
                    {formatDistance(supplier.distance)}
                  </Text>
                </View>
              </View>

              {/* Delivery / Contact mode */}
              <View style={styles.supplierModeRow}>
                {supplier.mode === 'ORDER'
                  ? (
                      <View style={styles.modeChipOrder}>
                        <Truck size={11} color={colors.green[600]} strokeWidth={2.5} />
                        <Text style={styles.modeChipOrderText}>Livraison disponible</Text>
                      </View>
                    )
                  : (
                      <View style={[styles.modeChipContact, { borderColor: semantic.borderNormal }]}>
                        <Text style={[styles.modeChipContactText, { color: semantic.textSecondary }]}>Mise en relation</Text>
                      </View>
                    )}
              </View>
            </View>

            <ChevronRight size={20} color={semantic.textTertiary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ============================================================== */}
        {/* INFORMATIONS                                                    */}
        {/* ============================================================== */}
        <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
        <View style={styles.section}>
          <View style={[styles.infoNotice, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}>
            <Info size={16} color={semantic.textTertiary} strokeWidth={2} />
            <Text style={[styles.infoNoticeText, { color: semantic.textSecondary }]}>
              Les prix et la disponibilité peuvent varier. Les photos sont indicatives. Contactez le fournisseur pour plus de détails.
            </Text>
          </View>
        </View>

        {/* ============================================================== */}
        {/* QUANTITÉ                                                        */}
        {/* ============================================================== */}
        {product.isInStock && (
          <>
            <View style={[styles.divider, { backgroundColor: semantic.borderLight }]} />
            <View style={styles.quantitySection}>
              <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Quantité</Text>
              <View style={styles.quantityControls}>
                <QtyButton
                  onPress={handleDecrement}
                  disabled={quantity <= 1}
                  semantic={semantic}
                >
                  <Minus
                    size={22}
                    color={quantity <= 1 ? semantic.textTertiary : colors.green[600]}
                    strokeWidth={2.5}
                  />
                </QtyButton>

                <View style={styles.quantityDisplay}>
                  <Text style={[styles.quantityValue, { color: semantic.textPrimary }]}>
                    {quantity}
                  </Text>
                  <Text style={[styles.quantityUnit, { color: semantic.textTertiary }]}>
                    {product.unit}
                  </Text>
                </View>

                <QtyButton
                  onPress={handleIncrement}
                  disabled={quantity >= 99}
                  semantic={semantic}
                >
                  <Plus
                    size={22}
                    color={quantity >= 99 ? semantic.textTertiary : colors.green[600]}
                    strokeWidth={2.5}
                  />
                </QtyButton>
              </View>

              {/* Subtotal preview */}
              <Text style={[styles.subtotalText, { color: semantic.textSecondary }]}>
                Sous-total : {formatPrice(totalPrice)} FCFA
              </Text>
            </View>
          </>
        )}
      </Animated.ScrollView>

      {/* ============================================================== */}
      {/* STICKY BOTTOM BAR                                                */}
      {/* ============================================================== */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: semantic.bgPage,
            borderTopColor: semantic.borderLight,
            paddingBottom: Math.max(insets.bottom, spacing[4]),
          },
        ]}
      >
        {/* Price summary */}
        <View style={styles.bottomPriceCol}>
          <Text style={[styles.bottomPriceLabel, { color: semantic.textTertiary }]}>Total</Text>
          <Text style={[styles.bottomPriceValue, { color: semantic.textPrimary }]}>
            {formatPrice(totalPrice)} FCFA
          </Text>
        </View>

        {/* Add to cart button */}
        <Pressable
          style={[
            styles.addToCartButton,
            { backgroundColor: product.isInStock ? colors.green[400] : colors.neutral[300] },
          ]}
          onPress={handleAddToCart}
          disabled={!product.isInStock}
          accessibilityRole="button"
          accessibilityLabel={
            product.isInStock
              ? `Ajouter ${quantity} au panier`
              : 'Produit indisponible'
          }
        >
          <ShoppingBag
            size={20}
            color={product.isInStock ? colors.neutral[0] : colors.neutral[500]}
            strokeWidth={2.5}
          />
          <Text
            style={[
              styles.addToCartText,
              { color: product.isInStock ? colors.neutral[0] : colors.neutral[500] },
            ]}
          >
            {product.isInStock ? 'Ajouter au panier' : 'Indisponible'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  icon,
  semantic,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  semantic: ReturnType<typeof useTheme>['semantic']
}) {
  return (
    <View style={detailStyles.row}>
      <Text style={[detailStyles.label, { color: semantic.textTertiary }]}>{label}</Text>
      <View style={detailStyles.valueRow}>
        {icon}
        <Text style={[detailStyles.value, { color: semantic.textPrimary }]}>{value}</Text>
      </View>
    </View>
  )
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  value: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
})

function QtyButton({
  onPress,
  disabled,
  children,
  semantic,
}: {
  onPress: () => void
  disabled: boolean
  children: React.ReactNode
  semantic: ReturnType<typeof useTheme>['semantic']
}) {
  const scale = useRef(new Animated.Value(1)).current

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.85, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, friction: 3, tension: 200, useNativeDriver: true }).start()}
      disabled={disabled}
    >
      <Animated.View
        style={[
          styles.qtyButton,
          {
            backgroundColor: disabled ? semantic.bgSurface : colors.green[50],
            borderColor: disabled ? semantic.borderLight : colors.green[200],
            transform: [{ scale }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },

  // Floating header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero
  heroContainer: {
    position: 'relative',
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlaceholderLetter: {
    fontFamily: fonts.display,
    fontSize: 80,
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'transparent',
  },
  heroPromoBadge: {
    position: 'absolute',
    bottom: spacing[3],
    left: spacing[4],
    backgroundColor: colors.coral[400],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.md,
  },
  heroPromoBadgeText: {
    fontFamily: fonts.sansBd,
    fontSize: 14,
    color: colors.neutral[0],
    letterSpacing: 0.3,
  },
  heroOutOfStock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[2],
  },
  heroOutOfStockText: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
    color: colors.neutral[0],
  },
  heroOutOfStockSub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  heroDotsRow: {
    position: 'absolute',
    bottom: spacing[3],
    right: spacing[4],
    flexDirection: 'row',
    gap: 6,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  heroDotActive: {
    backgroundColor: colors.neutral[0],
    width: 18,
  },

  // Info section
  infoSection: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  categoryPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  categoryPillText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  bioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.green[50],
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.green[200],
  },
  bioPillText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
    color: colors.green[600],
  },
  productName: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 28 * 1.15,
  },

  // Price
  priceBlock: {
    gap: 4,
  },
  priceMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceCurrent: {
    fontFamily: fonts.mono,
    fontSize: 30,
    color: colors.green[600],
    lineHeight: 30 * 1.1,
  },
  pricePromo: {
    fontFamily: fonts.mono,
    fontSize: 30,
    color: colors.coral[400],
    lineHeight: 30 * 1.1,
  },
  priceCurrency: {
    fontFamily: fonts.sansMd,
    fontSize: 16,
    color: colors.green[600],
  },
  priceOld: {
    fontFamily: fonts.mono,
    fontSize: 16,
    textDecorationLine: 'line-through',
  },
  discountPill: {
    backgroundColor: colors.coral[400],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: spacing[2],
  },
  discountPillText: {
    fontFamily: fonts.sansBd,
    fontSize: 11,
    color: colors.neutral[0],
  },
  unitLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    marginTop: 2,
  },

  // Info chips
  infoChipsRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  infoChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  infoChipText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
  },

  // Sections
  section: {
    paddingHorizontal: spacing[5],
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.h3,
  },
  divider: {
    height: 1,
    marginHorizontal: spacing[5],
    marginVertical: spacing[5],
  },

  // Description
  descriptionText: {
    ...typography.bodyL,
    lineHeight: 15 * 1.8,
  },

  // Details card
  detailsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailDivider: {
    height: 1,
    marginHorizontal: spacing[4],
  },

  // Supplier card
  supplierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing[3],
  },
  supplierAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  supplierAvatarFallback: {
    backgroundColor: colors.green[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierAvatarText: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
    color: colors.green[600],
  },
  supplierInfo: {
    flex: 1,
    gap: spacing[1],
  },
  supplierNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  supplierName: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
  },
  supplierMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontFamily: fonts.sansMd,
    fontSize: 12,
  },
  metaTextLight: {
    fontFamily: fonts.sans,
    fontSize: 11,
  },
  supplierModeRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  modeChipOrder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.green[50],
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  modeChipOrderText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
    color: colors.green[600],
  },
  modeChipContact: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  modeChipContactText: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
  },

  // Info notice
  infoNotice: {
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  infoNoticeText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 12 * 1.6,
  },

  // Quantity
  quantitySection: {
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[6],
  },
  qtyButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityDisplay: {
    alignItems: 'center',
    minWidth: 56,
  },
  quantityValue: {
    fontFamily: fonts.mono,
    fontSize: 32,
    lineHeight: 32 * 1.1,
  },
  quantityUnit: {
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: 2,
  },
  subtotalText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
    marginTop: spacing[1],
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  bottomPriceCol: {
    gap: 2,
  },
  bottomPriceLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
  },
  bottomPriceValue: {
    fontFamily: fonts.mono,
    fontSize: 18,
    lineHeight: 18 * 1.2,
  },
  addToCartButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 52,
    borderRadius: radius.xl,
  },
  addToCartText: {
    fontFamily: fonts.sansBd,
    fontSize: 16,
    letterSpacing: 0.2,
  },
})
