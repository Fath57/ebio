import type { ProductPromotion } from '../promotions'
import type { NutritionalValues, ProductCompositionData } from './product-composition'
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import Heart from 'lucide-react-native/dist/esm/icons/heart'
import Info from 'lucide-react-native/dist/esm/icons/info'
import Leaf from 'lucide-react-native/dist/esm/icons/leaf'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Percent from 'lucide-react-native/dist/esm/icons/percent'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Share2 from 'lucide-react-native/dist/esm/icons/share-2'
import Star from 'lucide-react-native/dist/esm/icons/star'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { MAX_ITEM_QUANTITY, useCart } from '../../cart/cart-context'
import { BasketSuggestions } from '../../cart/components/basket-suggestions'
import { CART_CTA_BAR_CLEARANCE } from '../../cart/components/cart-cta-bar'
import { formatDistance, formatPrice } from '../../search/components/search-result-card'
import { useProductUnits } from '../hooks/use-product-units'
import { describePromotion, parsePromotions, promotionChipLabels, promotionChipLabelsFor } from '../promotions'
import { ProductCompositionSections, ProductLabelChips } from './product-composition'
import { PromotionChips } from './promotion-chips'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const HERO_HEIGHT = 380

/**
 * Ce que la fiche attend. Exporté pour que les écrans appelants composent ces
 * objets par une fonction de mappage typée : un champ mal nommé se voyait
 * jusqu'ici à l'exécution, sous forme de note manquante ou de produit déclaré
 * indisponible, jamais à la compilation.
 */
export interface ProductDetailProduct {
  id: string
  name: string
  imageUrl: string | null
  pricePerUnit: number
  promotionalPrice: number | null
  /** Live promotion types from the list row; the detail fetch refines them. */
  promotionTypes?: string[]
  unit: string
  isInStock: boolean
  categoryName?: string
  description?: string
  stock?: number
}

export interface ProductDetailSupplier {
  id: string
  shopName: string
  rating: number | null
  /** Absente quand l'écran est ouvert sans position connue (bannière, accueil). */
  distance?: number
  mode: 'CONTACT' | 'ORDER'
  isValidated: boolean
  profilePhoto?: string | null
  reviewCount?: number
}

interface ProductDetailScreenProps {
  product: ProductDetailProduct
  supplier: ProductDetailSupplier
  onGoBack: () => void
  onNavigateToSupplier: (supplierId: string) => void
  /** Opens another product of the shop (suggestions rail). */
  onOpenProduct?: (productId: string) => void
}

export function ProductDetailScreen({
  product,
  supplier,
  onGoBack,
  onNavigateToSupplier,
  onOpenProduct,
}: ProductDetailScreenProps) {
  const { semantic } = useTheme()
  const { shortLabel } = useProductUnits()
  const insets = useSafeAreaInsets()
  const { getItemCount, groups, addItem, updateQuantity } = useCart()
  // Keep the content clear of the floating cart bar.
  const cartBarClearance = getItemCount() > 0 ? CART_CTA_BAR_CLEARANCE : 0
  const [isFavorite, setIsFavorite] = useState(false)
  const [composition, setComposition] = useState<ProductCompositionData | null>(null)
  // Null until the detail fetch answers: the list row's types stand in meanwhile.
  const [promotions, setPromotions] = useState<ProductPromotion[] | null>(null)
  const scrollY = useRef(new Animated.Value(0)).current

  // The navigation param is a lean list payload — fetch the full product
  // detail to get the composition fields (fiche produit).
  useEffect(() => {
    let cancelled = false
    async function loadComposition() {
      try {
        const res = await apiFetch(`/api/products/${product.id}`)
        if (!res.ok)
          return
        const data = await res.json() as Record<string, unknown>
        if (cancelled)
          return
        setPromotions(parsePromotions(data.promotions))
        setComposition({
          ingredients: typeof data.ingredients === 'string' ? data.ingredients : null,
          allergens: Array.isArray(data.allergens) ? data.allergens as string[] : [],
          labels: Array.isArray(data.labels) ? data.labels as string[] : [],
          origin: typeof data.origin === 'string' ? data.origin : null,
          conservation: typeof data.conservation === 'string' ? data.conservation : null,
          nutritionalValues: data.nutritionalValues !== null && typeof data.nutritionalValues === 'object'
            ? data.nutritionalValues as NutritionalValues
            : null,
        })
      }
      catch {
        // Composition sections simply stay hidden when the fetch fails.
      }
    }
    loadComposition()
    return () => {
      cancelled = true
    }
  }, [product.id])

  const hasPromo = product.promotionalPrice !== null && product.promotionalPrice < product.pricePerUnit
  const displayPrice = hasPromo ? product.promotionalPrice! : product.pricePerUnit
  const discount = hasPromo ? Math.round((1 - product.promotionalPrice! / product.pricePerUnit) * 100) : 0
  const unitLabel = shortLabel(product.unit)
  const promotionTypes = useMemo(
    () => (promotions ? promotions.map(p => p.type) : product.promotionTypes ?? []),
    [promotions, product.promotionTypes],
  )
  const chipLabels = promotions ? promotionChipLabelsFor(promotions) : promotionChipLabels(promotionTypes)
  const suggestionSeed = useMemo(() => [product.id], [product.id])

  /** La quantité affichée est celle du panier : il n'y a plus d'état local. */
  const cartItem = useMemo(() => {
    for (const group of groups) {
      const found = group.items.find(item => item.productId === product.id)
      if (found) {
        return found
      }
    }
    return null
  }, [groups, product.id])

  const handleAdd = useCallback(() => {
    if (!product.isInStock) {
      return
    }
    if (cartItem) {
      updateQuantity(cartItem.id, cartItem.quantity + 1)
      return
    }
    addItem({
      productId: product.id,
      supplierId: supplier.id,
      supplierName: supplier.shopName,
      name: product.name,
      imageUrl: product.imageUrl,
      pricePerUnit: displayPrice,
      unit: product.unit,
      quantity: 1,
      promotionTypes,
    })
  }, [cartItem, product, supplier, displayPrice, promotionTypes, addItem, updateQuantity])

  const handleRemove = useCallback(() => {
    if (cartItem) {
      updateQuantity(cartItem.id, cartItem.quantity - 1)
    }
  }, [cartItem, updateQuantity])

  const handleShare = useCallback(async () => {
    try {
      // The public product page carries the OG preview card and opens the
      // app when it is installed.
      const url = `https://e-bio.org/produit/${product.id}`
      await Share.share({
        message: `${product.name} — ${formatPrice(displayPrice)} FCFA/${unitLabel}\nChez ${supplier.shopName} sur eBio 🌿\n${url}`,
      })
    }
    catch {
      // Share cancelled or failed
    }
  }, [product.id, product.name, displayPrice, unitLabel, supplier.shopName])

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
            <HeaderIcon
              Icon={Heart}
              tintProgress={headerButtonTint}
              fixedColor={isFavorite ? colors.coral[400] : undefined}
              fill={isFavorite ? colors.coral[400] : 'none'}
            />
          </Pressable>
          <Pressable
            style={styles.headerButton}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Partager"
          >
            <HeaderIcon Icon={Share2} tintProgress={headerButtonTint} />
          </Pressable>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 64 + insets.bottom + spacing[6] + cartBarClearance }}
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
        <View style={[styles.sheet, { backgroundColor: semantic.bgCard }]} />

        {/* ============================================================== */}
        {/* PRODUCT INFO                                                    */}
        {/* ============================================================== */}
        <View style={[styles.infoSection, { backgroundColor: semantic.bgCard }]}>
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
            {composition !== null && composition.labels.length > 0 && (
              <ProductLabelChips labels={composition.labels} />
            )}
          </View>

          {/* Price block — editorial treatment */}
          <View style={styles.priceBlock}>
            <View style={styles.priceHeaderRow}>
              <View style={styles.priceTexts}>
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
                  <PromotionChips labels={chipLabels} />
                </View>
              </View>

              {/* Le geste d'achat est ici, à hauteur du prix : il n'y a plus de
                  bouton à aller chercher au bas d'une longue fiche. */}
              {product.isInStock && (
                <CartControl
                  quantity={cartItem?.quantity ?? 0}
                  unitLabel={unitLabel}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                />
              )}
            </View>
          </View>

          {/* Live promotions, in plain words */}
          {promotions && promotions.length > 0 && (
            <View style={[styles.promotionsBlock, { backgroundColor: semantic.bgPrimaryLight }]}>
              <Text style={[styles.promotionsTitle, { color: colors.green[800] }]}>Promotions</Text>
              {promotions.map((promotion, index) => (
                <View key={`${promotion.type}-${index}`} style={styles.promotionRow}>
                  <Percent size={13} color={colors.green[600]} strokeWidth={2.2} />
                  <Text style={[styles.promotionText, { color: colors.green[800] }]}>
                    {describePromotion(promotion, formatPrice)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Le reste du rayon de cette boutique */}
          <View style={styles.suggestionsBlock}>
            <BasketSuggestions
              supplierId={supplier.id}
              productIds={suggestionSeed}
              title="D'autres produits du fournisseur"
              // Ici le lien entre les produits est la boutique, pas le panier :
              // « souvent acheté avec vos articles » parlerait d'un panier que
              // l'acheteur n'a pas forcément sous les yeux.
              reasonLabels={{ BOUGHT_TOGETHER: 'Du même fournisseur' }}
              onOpenProduct={onOpenProduct}
            />
          </View>
        </View>

        {/* ============================================================== */}
        {/* DESCRIPTION                                                     */}
        {/* ============================================================== */}
        {product.description && (
          <>
            <View style={[styles.divider, { backgroundColor: semantic.bgPage }]} />
            <View style={[styles.section, { backgroundColor: semantic.bgCard }]}>
              <Text style={[styles.sectionTitle, { color: semantic.textPrimary }]}>Description</Text>
              <Text style={[styles.descriptionText, { color: semantic.textSecondary }]}>
                {product.description}
              </Text>
            </View>
          </>
        )}

        {/* ============================================================== */}
        {/* FICHE PRODUIT — composition                                     */}
        {/* ============================================================== */}
        <ProductCompositionSections composition={composition} />

        {/* ============================================================== */}
        {/* FOURNISSEUR                                                     */}
        {/* ============================================================== */}
        <View style={[styles.divider, { backgroundColor: semantic.bgPage }]} />
        <View style={[styles.section, { backgroundColor: semantic.bgCard }]}>
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
                {supplier.rating != null && (
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
                {supplier.distance !== undefined && (
                  <View style={styles.metaItem}>
                    <MapPin size={12} color={semantic.textTertiary} strokeWidth={2} />
                    <Text style={[styles.metaText, { color: semantic.textSecondary }]}>
                      {formatDistance(supplier.distance)}
                    </Text>
                  </View>
                )}
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

/**
 * Header icon that follows the scroll: white over the photo, ink over the
 * page once the header has turned opaque. `fixedColor` opts out for a state
 * that carries its own meaning — a favourited heart stays coral throughout.
 */
function HeaderIcon({
  Icon,
  tintProgress,
  fixedColor,
  fill,
}: {
  Icon: React.ComponentType<{ size: number, color: string, strokeWidth?: number, fill?: string }>
  tintProgress: Animated.AnimatedInterpolation<number>
  fixedColor?: string
  fill?: string
}) {
  if (fixedColor) {
    return (
      <View style={{ width: 20, height: 20 }}>
        <Icon size={20} color={fixedColor} fill={fill ?? 'none'} strokeWidth={2.2} />
      </View>
    )
  }
  return (
    <View style={{ width: 20, height: 20 }}>
      <Animated.View style={{ position: 'absolute', opacity: Animated.subtract(1, tintProgress) }}>
        <Icon size={20} color={colors.neutral[0]} fill={fill ?? 'none'} strokeWidth={2.2} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', opacity: tintProgress }}>
        <Icon size={20} color={colors.neutral[800]} fill={fill ?? 'none'} strokeWidth={2.2} />
      </Animated.View>
    </View>
  )
}

interface CartControlProps {
  /** Quantité au panier. 0 = le produit n'y est pas encore. */
  quantity: number
  unitLabel: string
  onAdd: () => void
  onRemove: () => void
}

/**
 * Même geste que sur les cartes produit : un « + » tant que rien n'est au
 * panier, puis un compteur branché directement dessus. Pas de bouton
 * « Ajouter au panier » à valider — la quantité affichée EST celle du panier.
 */
function CartControl({ quantity, unitLabel, onAdd, onRemove }: CartControlProps) {
  const isAtMax = quantity >= MAX_ITEM_QUANTITY

  if (quantity === 0) {
    return (
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [
          styles.cartAddButton,
          { backgroundColor: colors.green[600], transform: [{ scale: pressed ? 0.94 : 1 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Ajouter au panier"
      >
        <Plus size={22} color={colors.neutral[0]} strokeWidth={2.8} />
      </Pressable>
    )
  }

  return (
    <View style={[styles.cartStepper, { backgroundColor: colors.green[600] }]}>
      <Pressable
        onPress={onRemove}
        style={styles.cartStepperButton}
        accessibilityRole="button"
        accessibilityLabel={quantity === 1 ? 'Retirer du panier' : 'Diminuer la quantité'}
      >
        <Minus size={16} color={colors.neutral[0]} strokeWidth={2.8} />
      </Pressable>
      <View style={styles.cartStepperValueWrap}>
        <Text style={styles.cartStepperValue}>{quantity}</Text>
        <Text style={styles.cartStepperUnit}>{unitLabel}</Text>
      </View>
      <Pressable
        onPress={onAdd}
        disabled={isAtMax}
        style={[styles.cartStepperButton, isAtMax && styles.cartStepperButtonDisabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: isAtMax }}
        accessibilityLabel={isAtMax ? `Quantité maximale de ${MAX_ITEM_QUANTITY} atteinte` : 'Augmenter la quantité'}
      >
        <Plus size={16} color={colors.neutral[0]} strokeWidth={2.8} />
      </Pressable>
    </View>
  )
}

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
  priceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  priceTexts: {
    flex: 1,
  },
  cartAddButton: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[1],
  },
  cartStepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStepperButtonDisabled: {
    opacity: 0.4,
  },
  cartStepperValueWrap: {
    minWidth: 44,
    alignItems: 'center',
  },
  cartStepperValue: {
    ...typography.h3,
    color: colors.neutral[0],
  },
  cartStepperUnit: {
    ...typography.caption,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.75)',
  },
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
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.h3,
  },
  divider: {
    height: spacing[2],
  },

  suggestionsBlock: {
    marginTop: spacing[4],
  },

  // Promotions
  promotionsBlock: {
    marginTop: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    gap: spacing[2],
  },
  promotionsTitle: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
  promotionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  promotionText: {
    ...typography.bodyS,
    flex: 1,
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
