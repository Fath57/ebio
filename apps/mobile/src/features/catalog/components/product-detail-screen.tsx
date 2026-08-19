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
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { formatDistance, formatPrice } from '../../search/components/search-result-card'
import { useProductUnits } from '../hooks/use-product-units'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const HERO_HEIGHT = 380

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

export function ProductDetailScreen({
  product,
  supplier,
  onGoBack,
  onAddToCart,
  onNavigateToSupplier,
}: ProductDetailScreenProps) {
  const { semantic } = useTheme()
  const { shortLabel } = useProductUnits()
  const insets = useSafeAreaInsets()
  const [quantity, setQuantity] = useState(1)
  const [isFavorite, setIsFavorite] = useState(false)
  const scrollY = useRef(new Animated.Value(0)).current

  const hasPromo = product.promotionalPrice !== null && product.promotionalPrice < product.pricePerUnit
  const displayPrice = hasPromo ? product.promotionalPrice! : product.pricePerUnit
  const totalPrice = displayPrice * quantity
  const discount = hasPromo ? Math.round((1 - product.promotionalPrice! / product.pricePerUnit) * 100) : 0
  const unitLabel = shortLabel(product.unit)

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

  // Scroll-driven animations
  const headerBg = scrollY.interpolate({
    inputRange: [HERO_HEIGHT - 160, HERO_HEIGHT - 80],
    outputRange: ['rgba(0,0,0,0)', semantic.bgPage],
    extrapolate: 'clamp',
  })
  const headerTitleOpacity = scrollY.interpolate({
    inputRange: [HERO_HEIGHT - 140, HERO_HEIGHT - 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  const headerButtonTint = scrollY.interpolate({
    inputRange: [HERO_HEIGHT - 140, HERO_HEIGHT - 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT],
    outputRange: [0, HERO_HEIGHT * 0.35],
    extrapolate: 'clamp',
  })
  const heroScale = scrollY.interpolate({
    inputRange: [-HERO_HEIGHT, 0],
    outputRange: [1.8, 1],
    extrapolate: 'clamp',
  })

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgPage }]}>
      {/* Floating header */}
      <Animated.View
        style={[
          styles.floatingHeader,
          {
            backgroundColor: headerBg,
            paddingTop: insets.top,
            borderBottomColor: semantic.borderLight,
          },
        ]}
      >
        <Animated.View
          style={[styles.headerBorderOverlay, { opacity: headerButtonTint, borderBottomColor: semantic.borderLight }]}
          pointerEvents="none"
        />
        <Pressable
          style={styles.headerButton}
          onPress={onGoBack}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={8}
        >
          <HeaderIcon Icon={ArrowLeft} tintProgress={headerButtonTint} />
        </Pressable>

        <Animated.Text
          numberOfLines={1}
          style={[
            styles.headerTitle,
            { color: semantic.textPrimary, opacity: headerTitleOpacity },
          ]}
        >
          {product.name}
        </Animated.Text>

        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerButton}
            onPress={() => setIsFavorite(prev => !prev)}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Heart
              size={20}
              color={isFavorite ? colors.coral[400] : colors.neutral[0]}
              fill={isFavorite ? colors.coral[400] : 'none'}
              strokeWidth={2.2}
            />
          </Pressable>
          <Pressable
            style={styles.headerButton}
            onPress={() => {}}
            accessibilityRole="button"
            accessibilityLabel="Partager"
          >
            <HeaderIcon Icon={Share2} tintProgress={headerButtonTint} />
          </Pressable>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 64 + insets.bottom + spacing[6] }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
      >
        {/* ============================================================== */}
        {/* HERO IMAGE — parallax                                           */}
        {/* ============================================================== */}
        <View style={styles.heroContainer}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [{ translateY: heroTranslateY }, { scale: heroScale }],
              },
            ]}
          >
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
          </Animated.View>

          {/* Gradient overlay bottom */}
          <View style={styles.heroGradient} />

          {/* Promo badge */}
          {hasPromo && (
            <View style={styles.heroPromoBadge}>
              <Text style={styles.heroPromoBadgeText}>
                −
                {discount}
                %
              </Text>
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
        </View>

        {/* Sheet that overlaps the hero for depth */}
        <View style={[styles.sheet, { backgroundColor: semantic.bgPage }]} />

        {/* ============================================================== */}
        {/* PRODUCT INFO                                                    */}
        {/* ============================================================== */}
        <View style={styles.infoSection}>
          {/* Category overline */}
          {product.categoryName && (
            <Text style={[styles.categoryOverline, { color: semantic.textTertiary }]}>
              {product.categoryName.toUpperCase()}
            </Text>
          )}

          {/* Product name */}
          <Text style={[styles.productName, { color: semantic.textPrimary }]}>
            {product.name}
          </Text>

          {/* Bio pill + stock chip inline */}
          <View style={styles.tagRow}>
            <View style={styles.bioPill}>
              <Leaf size={10} color={colors.green[600]} strokeWidth={2.5} />
              <Text style={styles.bioPillText}>Bio certifié</Text>
            </View>
            <View style={[styles.stockChip, { backgroundColor: product.isInStock ? colors.green[50] : colors.coral[50] }]}>
              <View style={[styles.stockChipDot, { backgroundColor: product.isInStock ? colors.green[400] : colors.coral[400] }]} />
              <Text style={[styles.stockChipText, { color: product.isInStock ? colors.green[800] : colors.coral[600] }]}>
                {product.isInStock
                  ? product.stock !== undefined ? `${product.stock} disponibles` : 'En stock'
                  : 'Indisponible'}
              </Text>
            </View>
          </View>

          {/* Price block — editorial treatment */}
          <View style={styles.priceBlock}>
            <View style={styles.priceMainRow}>
              <Text style={[styles.priceAmount, { color: hasPromo ? colors.coral[400] : colors.green[600] }]}>
                {formatPrice(displayPrice)}
              </Text>
              <Text style={[styles.priceCurrency, { color: hasPromo ? colors.coral[400] : colors.green[600] }]}>FCFA</Text>
            </View>
            <View style={styles.priceMetaRow}>
              <Text style={[styles.priceUnit, { color: semantic.textSecondary }]}>
                /
                {' '}
                {unitLabel}
              </Text>
              {hasPromo && (
                <>
                  <View style={[styles.priceDot, { backgroundColor: semantic.textTertiary }]} />
                  <Text style={[styles.priceOld, { color: semantic.textTertiary }]}>
                    {formatPrice(product.pricePerUnit)}
                    {' '}
                    FCFA
                  </Text>
                  <View style={styles.discountPill}>
                    <Text style={styles.discountPillText}>
                      −
                      {discount}
                      %
                    </Text>
                  </View>
                </>
              )}
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
                        (
                        {supplier.reviewCount}
                        )
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
        {/* INFO NOTICE — discrète                                          */}
        {/* ============================================================== */}
        <View style={styles.noticeRow}>
          <Info size={12} color={semantic.textTertiary} strokeWidth={2} />
          <Text style={[styles.noticeText, { color: semantic.textTertiary }]}>
            Prix et disponibilité indicatifs. Contactez le fournisseur pour tout détail.
          </Text>
        </View>

        {/* ============================================================== */}
        {/* QUANTITÉ + CTA — card premium                                   */}
        {/* ============================================================== */}
        {product.isInStock && (
          <View style={styles.ctaSection}>
            <View style={[styles.ctaCard, { backgroundColor: semantic.bgPage, borderColor: semantic.borderLight }]}>
              {/* Stepper row with price recap */}
              <View style={styles.stepperRow}>
                <View style={styles.stepper}>
                  <StepperButton
                    onPress={handleDecrement}
                    disabled={quantity <= 1}
                  >
                    <Minus
                      size={16}
                      color={quantity <= 1 ? semantic.textTertiary : colors.green[800]}
                      strokeWidth={2.5}
                    />
                  </StepperButton>
                  <View style={styles.stepperValueWrap}>
                    <Text style={styles.stepperValue}>
                      {quantity}
                    </Text>
                    <Text style={styles.stepperUnit}>
                      {product.unit}
                    </Text>
                  </View>
                  <StepperButton
                    onPress={handleIncrement}
                    disabled={quantity >= 99}
                  >
                    <Plus
                      size={16}
                      color={quantity >= 99 ? semantic.textTertiary : colors.green[800]}
                      strokeWidth={2.5}
                    />
                  </StepperButton>
                </View>

                <View style={styles.subtotalBlock}>
                  <Text style={[styles.subtotalLabel, { color: semantic.textTertiary }]}>
                    Sous-total
                  </Text>
                  <Text style={[styles.subtotalValue, { color: semantic.textPrimary }]}>
                    {formatPrice(totalPrice)}
                    <Text style={[styles.subtotalCurrency, { color: semantic.textSecondary }]}> FCFA</Text>
                  </Text>
                </View>
              </View>

              {/* Primary CTA */}
              <Pressable
                style={({ pressed }) => [
                  styles.primaryCta,
                  { backgroundColor: colors.green[600], transform: [{ scale: pressed ? 0.985 : 1 }] },
                ]}
                onPress={handleAddToCart}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${quantity} au panier, total ${formatPrice(totalPrice)} FCFA`}
              >
                <ShoppingBag size={18} color={colors.neutral[0]} strokeWidth={2.5} />
                <Text style={styles.primaryCtaText}>Ajouter au panier</Text>
                <ChevronRight size={18} color={colors.neutral[0]} strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Out of stock CTA */}
        {!product.isInStock && (
          <View style={styles.ctaSection}>
            <View style={[styles.ctaCard, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight, alignItems: 'center' }]}>
              <Package size={28} color={semantic.textTertiary} strokeWidth={1.5} />
              <Text style={[styles.outOfStockTitle, { color: semantic.textPrimary }]}>
                Produit indisponible
              </Text>
              <Text style={[styles.outOfStockSub, { color: semantic.textTertiary }]}>
                Revenez plus tard ou contactez le fournisseur.
              </Text>
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </View>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function HeaderIcon({
  Icon,
  tintProgress,
}: {
  Icon: React.ComponentType<{ size: number, color: string, strokeWidth?: number }>
  tintProgress: Animated.AnimatedInterpolation<number>
}) {
  return (
    <View style={{ width: 20, height: 20 }}>
      <Animated.View style={{ position: 'absolute', opacity: Animated.subtract(1, tintProgress) }}>
        <Icon size={20} color={colors.neutral[0]} strokeWidth={2.2} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', opacity: tintProgress }}>
        <Icon size={20} color={colors.neutral[800]} strokeWidth={2.2} />
      </Animated.View>
    </View>
  )
}

function StepperButton({
  onPress,
  disabled,
  children,
}: {
  onPress: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.stepperButton,
        {
          backgroundColor: disabled ? 'transparent' : colors.neutral[0],
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {children}
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
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    gap: spacing[3],
  },
  headerBorderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.sansSb,
    fontSize: 15,
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20,20,16,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero — parallax container
  heroContainer: {
    position: 'relative',
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
    overflow: 'hidden',
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
    height: 100,
    backgroundColor: 'transparent',
  },
  heroPromoBadge: {
    position: 'absolute',
    bottom: spacing[5] + spacing[3],
    left: spacing[5],
    backgroundColor: colors.coral[400],
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.sm,
    shadowColor: colors.coral[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  heroPromoBadgeText: {
    fontFamily: fonts.sansBd,
    fontSize: 13,
    color: colors.neutral[0],
    letterSpacing: 0.4,
  },
  heroOutOfStock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
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
    color: 'rgba(255,255,255,0.75)',
  },

  // Sheet that overlaps the hero to create depth
  sheet: {
    marginTop: -spacing[6],
    height: spacing[6],
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  // Info section — editorial layout
  infoSection: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  categoryOverline: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  productName: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 32 * 1.1,
    letterSpacing: -0.5,
    marginTop: -spacing[1],
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing[2],
    flexWrap: 'wrap',
    marginTop: spacing[1],
  },
  bioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.green[50],
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.green[200],
  },
  bioPillText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    color: colors.green[800],
    letterSpacing: 0.2,
  },
  stockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  stockChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stockChipText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    letterSpacing: 0.2,
  },

  // Price — editorial
  priceBlock: {
    marginTop: spacing[3],
    gap: spacing[1],
  },
  priceMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  priceAmount: {
    fontFamily: fonts.mono,
    fontSize: 36,
    lineHeight: 36 * 1.05,
    letterSpacing: -0.8,
  },
  priceCurrency: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  priceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  priceUnit: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  priceDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  priceOld: {
    fontFamily: fonts.mono,
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  discountPill: {
    backgroundColor: colors.coral[400],
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  discountPillText: {
    fontFamily: fonts.sansBd,
    fontSize: 10,
    color: colors.neutral[0],
    letterSpacing: 0.3,
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

  // Info notice — inline discrète
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
  },
  noticeText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 11 * 1.5,
  },

  // CTA section — premium
  ctaSection: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
  },
  ctaCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing[4],
    gap: spacing[4],
    shadowColor: colors.green[800],
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.green[50],
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.green[100],
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValueWrap: {
    minWidth: 52,
    alignItems: 'center',
  },
  stepperValue: {
    fontFamily: fonts.sansBd,
    fontSize: 17,
    lineHeight: 17 * 1.1,
    color: colors.green[900],
  },
  stepperUnit: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: -2,
    color: colors.green[600],
  },
  subtotalBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  subtotalLabel: {
    fontFamily: fonts.sansMd,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  subtotalValue: {
    fontFamily: fonts.mono,
    fontSize: 20,
    lineHeight: 20 * 1.1,
    letterSpacing: -0.3,
  },
  subtotalCurrency: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 56,
    borderRadius: radius.pill,
    shadowColor: colors.green[900],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryCtaText: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
    color: colors.neutral[0],
    letterSpacing: 0.3,
  },
  outOfStockTitle: {
    fontFamily: fonts.sansBd,
    fontSize: 15,
    marginTop: spacing[2],
  },
  outOfStockSub: {
    fontFamily: fonts.sans,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing[1],
  },
})
