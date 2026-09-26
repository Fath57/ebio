import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import ArrowRight from 'lucide-react-native/dist/esm/icons/arrow-right'
import Gift from 'lucide-react-native/dist/esm/icons/gift'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import ShoppingCart from 'lucide-react-native/dist/esm/icons/shopping-cart'
import Store from 'lucide-react-native/dist/esm/icons/store'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import Truck from 'lucide-react-native/dist/esm/icons/truck'
import * as React from 'react'
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { FadeInView } from '../../../utils/animations'
import { unitShortLabel } from '../../catalog/hooks/use-product-units'
import { ScreenHeader } from '../../common/components/screen-header'

type DeliveryMode = 'PICKUP' | 'DELIVERY'

interface CartVariant {
  id: string
  label: string
}

interface CartItem {
  id: string
  productId: string
  /** Which shop sells it — one basket per shop, one order per basket. */
  supplierId: string
  supplierName: string
  name: string
  imageUrl: string | null
  pricePerUnit: number
  unit: string
  quantity: number
  selectedVariant: CartVariant | null
  availableVariants: CartVariant[]
  /** Live promotion types on the product when added (absent on older carts). */
  promotionTypes?: string[]
}

interface CartScreenProps {
  /** Every item, its shop carried on each one. */
  items: CartItem[]
  /** How a given shop hands over. One basket, one choice. */
  deliveryModeFor: (supplierId: string) => DeliveryMode
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onSelectVariant: (itemId: string, variant: CartVariant) => void
  onChangeDeliveryMode: (supplierId: string, mode: DeliveryMode) => void
  /** Checks out one shop's basket. A cart never mixes two in one order. */
  onCheckout: (supplierId: string) => void
  onRemoveItem: (itemId: string) => void
  onContinueShopping?: () => void
  /** Opens the product page (image or name tapped). */
  onPressItem?: (productId: string) => void
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

interface ShopBasket {
  supplierId: string
  supplierName: string
  items: CartItem[]
}

/**
 * One basket per shop, in the order the shops were first added to.
 *
 * The cart used to be a flat list, on the principle that who sells what is the
 * platform's business and not the buyer's. It is the buyer's business: a
 * promo code belongs to one shop and was refused outright on a mixed basket,
 * a slow shop held up the other's delivery, and one payment covering several
 * orders made every refund a puzzle.
 */
function shopBaskets(items: CartItem[]): ShopBasket[] {
  const baskets: ShopBasket[] = []
  for (const item of items) {
    const existing = baskets.find(basket => basket.supplierId === item.supplierId)
    if (existing) {
      existing.items.push(item)
      continue
    }
    baskets.push({ supplierId: item.supplierId, supplierName: item.supplierName, items: [item] })
  }
  return baskets
}

/** What the server will add at checkout for this shop's basket, if anything. */
function promotionHint(items: CartItem[]): string | null {
  const types = new Set(items.flatMap(item => item.promotionTypes ?? []))
  const hasGift = types.has('BOGO')
  const hasFreeDelivery = types.has('FREE_DELIVERY')
  if (hasGift && hasFreeDelivery) {
    return 'Articles offerts et livraison offerte appliqués à la commande'
  }
  if (hasGift) {
    return 'Des articles offerts seront ajoutés à la commande'
  }
  if (hasFreeDelivery) {
    return 'Livraison offerte sur cette commande'
  }
  return null
}

/**
 * One compact pill rather than two separate buttons.
 *
 * At one unit the minus becomes a bin: removing a line is the same gesture as
 * decreasing it, so it belongs in the same control rather than in an icon
 * exiled to the far end of the row.
 */
function QuantityControl({
  quantity,
  onDecrease,
  onIncrease,
}: {
  quantity: number
  onDecrease: () => void
  onIncrease: () => void
}) {
  const { semantic } = useTheme()
  const isLast = quantity <= 1

  return (
    <View style={[quantityStyles.container, { backgroundColor: semantic.bgPage }]}>
      <TouchableOpacity
        style={quantityStyles.button}
        onPress={onDecrease}
        accessibilityRole="button"
        accessibilityLabel={isLast ? 'Retirer du panier' : 'Diminuer la quantité'}
      >
        {isLast
          ? <Trash2 size={16} color={colors.coral[400]} strokeWidth={2} />
          : <Minus size={16} color={semantic.textPrimary} strokeWidth={2.2} />}
      </TouchableOpacity>
      <Text style={[quantityStyles.value, { color: semantic.textPrimary }]}>{quantity}</Text>
      <TouchableOpacity
        style={quantityStyles.button}
        onPress={onIncrease}
        accessibilityRole="button"
        accessibilityLabel="Augmenter la quantité"
      >
        <Plus size={16} color={colors.green[600]} strokeWidth={2.2} />
      </TouchableOpacity>
    </View>
  )
}

const quantityStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  button: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontFamily: fonts.mono,
    fontSize: 16,
    minWidth: 24,
    textAlign: 'center',
  },
})

export function CartScreen({
  items,
  onUpdateQuantity,
  onSelectVariant,
  onChangeDeliveryMode,
  deliveryModeFor,
  onCheckout,
  onRemoveItem,
  onContinueShopping,
  onPressItem,
}: CartScreenProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()

  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const baskets = shopBaskets(items)

  if (items.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Mon panier" />
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: semantic.bgPrimaryLight }]}>
            <ShoppingCart size={40} color={colors.green[400]} />
          </View>
          <Text style={[styles.emptyTitle, { color: semantic.textPrimary }]}>
            Votre panier est vide
          </Text>
          <Text style={[styles.emptySubtitle, { color: semantic.textTertiary }]}>
            Parcourez le catalogue pour découvrir
            {'\n'}
            les meilleurs produits bio près de chez vous
          </Text>
          {onContinueShopping && (
            <TouchableOpacity
              style={styles.emptyCtaButton}
              onPress={onContinueShopping}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Explorer le catalogue"
            >
              <Text style={styles.emptyCtaText}>Explorer le catalogue</Text>
              <ArrowRight size={18} color={colors.neutral[0]} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  function computeGroupTotal(items: CartItem[]): number {
    return items.reduce((sum, item) => sum + item.pricePerUnit * item.quantity, 0)
  }

  function countItems(list: CartItem[]): number {
    return list.reduce((sum, item) => sum + item.quantity, 0)
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title="Mon panier"
        subtitle={`${totalItemCount} article${totalItemCount > 1 ? 's' : ''}`}
      />
      <ScrollView
        style={styles.scrollView}
        // The tab bar floats over the content: without its height the last
        // shop's order button sits underneath it.
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Un panier par boutique, chacun commandé pour lui-même. De qui vient
            un article n'est pas un détail : le code promo, la livraison et le
            remboursement appartiennent tous à une boutique. */}
        {items.length > 0 && (
          <>
            {baskets.map(basket => (
              <View key={basket.supplierId} style={[styles.supplierSection, { backgroundColor: semantic.bgCard }]}>
                <View style={[styles.shopHeader, { borderBottomColor: semantic.borderLight }]}>
                  <Store size={16} color={colors.green[600]} strokeWidth={2.2} />
                  <Text style={[styles.shopName, { color: semantic.textPrimary }]} numberOfLines={1}>
                    {basket.supplierName}
                  </Text>
                </View>
                {basket.items.map((item, index) => (
                  <FadeInView key={item.id} delay={index * 80}>
                    <View
                      style={[
                        styles.itemRow,
                        index < basket.items.length - 1 && [
                          styles.itemRowBorder,
                          { borderBottomColor: semantic.borderLight },
                        ],
                      ]}
                    >
                      <TouchableOpacity
                        onPress={() => onPressItem?.(item.productId)}
                        disabled={!onPressItem}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Voir le produit `}
                      >
                        {item.imageUrl
                          ? (
                              <Image
                                source={{ uri: item.imageUrl }}
                                style={styles.itemImage}
                                resizeMode="cover"
                              />
                            )
                          : (
                              <View style={[styles.itemImage, styles.itemImagePlaceholder, { backgroundColor: semantic.bgSurface }]}>
                                <Package size={24} color={semantic.textTertiary} />
                              </View>
                            )}
                      </TouchableOpacity>

                      <View style={styles.itemDetails}>
                        {/* The stepper's minus turns into a bin at one, which
                          made dropping a line of seven a seven-tap affair.
                          Removing is its own gesture, one tap whatever the
                          quantity. */}
                        <View style={styles.itemTopRow}>
                          <Text
                            style={[styles.itemName, { color: semantic.textPrimary }]}
                            numberOfLines={2}
                            onPress={onPressItem ? () => onPressItem(item.productId) : undefined}
                            accessibilityRole={onPressItem ? 'link' : undefined}
                          >
                            {item.name}
                          </Text>
                          <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() => onRemoveItem(item.id)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Retirer ${item.name} du panier`}
                          >
                            {/* Coral, like the bin the stepper shows at one:
                              the same gesture should not wear two colours. */}
                            <Trash2 size={16} color={colors.coral[400]} strokeWidth={2} />
                          </TouchableOpacity>
                        </View>

                        <Text style={[styles.itemUnitPrice, { color: semantic.textTertiary }]}>
                          {formatPrice(item.pricePerUnit)}
                          {' '}
                          FCFA /
                          {' '}
                          {unitShortLabel(item.unit)}
                        </Text>

                        {item.availableVariants.length > 0 && (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.variantRow}
                          >
                            {item.availableVariants.map((variant) => {
                              const isSelected = item.selectedVariant?.id === variant.id
                              return (
                                <TouchableOpacity
                                  key={variant.id}
                                  style={[
                                    styles.variantChip,
                                    { borderColor: semantic.borderNormal },
                                    isSelected && [styles.variantChipActive, { backgroundColor: semantic.bgPrimaryLight }],
                                  ]}
                                  onPress={() => onSelectVariant(item.id, variant)}
                                  accessibilityRole="radio"
                                  accessibilityState={{ selected: isSelected }}
                                >
                                  <Text
                                    style={[
                                      styles.variantChipText,
                                      { color: semantic.textSecondary },
                                      isSelected && [styles.variantChipTextActive, { color: semantic.textPrimaryColor }],
                                    ]}
                                  >
                                    {variant.label}
                                  </Text>
                                </TouchableOpacity>
                              )
                            })}
                          </ScrollView>
                        )}

                        <View style={styles.quantityRow}>
                          <QuantityControl
                            quantity={item.quantity}
                            onDecrease={() =>
                              item.quantity <= 1
                                ? onRemoveItem(item.id)
                                : onUpdateQuantity(item.id, item.quantity - 1)}
                            onIncrease={() =>
                              onUpdateQuantity(item.id, item.quantity + 1)}
                          />
                          <Text style={[styles.itemPrice, { color: semantic.textPrimary }]}>
                            {formatPrice(item.pricePerUnit * item.quantity)}
                            {' '}
                            FCFA
                          </Text>
                        </View>
                      </View>
                    </View>
                  </FadeInView>
                ))}

                {promotionHint(basket.items) !== null && (
                  <View style={[styles.promotionHint, { backgroundColor: semantic.bgPrimaryLight }]}>
                    <Gift size={14} color={colors.green[600]} strokeWidth={2} />
                    <Text style={[styles.promotionHintText, { color: colors.green[800] }]}>
                      {promotionHint(basket.items)}
                    </Text>
                  </View>
                )}

                {/* Le choix appartient à la boutique : l'une peut valoir le
                    détour à pied quand l'autre se fait livrer. */}
                <View style={styles.deliverySection}>
                  <Text style={[styles.deliveryLabel, { color: semantic.textSecondary }]}>
                    Mode de livraison
                  </Text>
                  <View style={styles.deliveryOptions}>
                    <TouchableOpacity
                      style={[
                        styles.deliveryOption,
                        { borderColor: semantic.borderNormal },
                        deliveryModeFor(basket.supplierId) === 'PICKUP' && [styles.deliveryOptionActive, { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[400] }],
                      ]}
                      onPress={() => onChangeDeliveryMode(basket.supplierId, 'PICKUP')}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: deliveryModeFor(basket.supplierId) === 'PICKUP' }}
                    >
                      <Store
                        size={16}
                        color={deliveryModeFor(basket.supplierId) === 'PICKUP' ? colors.green[600] : semantic.textTertiary}
                      />
                      <Text
                        style={[
                          styles.deliveryOptionText,
                          { color: semantic.textSecondary },
                          deliveryModeFor(basket.supplierId) === 'PICKUP' && [styles.deliveryOptionTextActive, { color: semantic.textPrimaryColor }],
                        ]}
                      >
                        Retrait sur place
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.deliveryOption,
                        { borderColor: semantic.borderNormal },
                        deliveryModeFor(basket.supplierId) === 'DELIVERY' && [styles.deliveryOptionActive, { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[400] }],
                      ]}
                      onPress={() => onChangeDeliveryMode(basket.supplierId, 'DELIVERY')}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: deliveryModeFor(basket.supplierId) === 'DELIVERY' }}
                    >
                      <Truck
                        size={16}
                        color={deliveryModeFor(basket.supplierId) === 'DELIVERY' ? colors.green[600] : semantic.textTertiary}
                      />
                      <Text
                        style={[
                          styles.deliveryOptionText,
                          { color: semantic.textSecondary },
                          deliveryModeFor(basket.supplierId) === 'DELIVERY' && [styles.deliveryOptionTextActive, { color: semantic.textPrimaryColor }],
                        ]}
                      >
                        Livraison
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Le bouton vit dans la carte de sa boutique : c'est elle
                    qu'on commande, et deux boutiques font deux commandes. */}
                <View style={[styles.basketFooter, { borderTopColor: semantic.borderLight }]}>
                  <View style={styles.grandTotalRow}>
                    <Text style={[styles.grandTotalLabel, { color: semantic.textSecondary }]}>
                      {countItems(basket.items)}
                      {' article'}
                      {countItems(basket.items) > 1 ? 's' : ''}
                    </Text>
                    <Text style={[styles.grandTotalValue, { color: semantic.textPrimary }]}>
                      {formatPrice(computeGroupTotal(basket.items))}
                      {' '}
                      FCFA
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.orderButton}
                    onPress={() => onCheckout(basket.supplierId)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Commander chez ${basket.supplierName}, ${formatPrice(computeGroupTotal(basket.items))} FCFA`}
                  >
                    <Text style={styles.orderButtonText} numberOfLines={1}>
                      Commander chez
                      {' '}
                      {basket.supplierName}
                    </Text>
                    <ArrowRight size={18} color={colors.neutral[0]} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

          </>
        )}
      </ScrollView>

    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  shopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shopName: {
    flex: 1,
    fontFamily: fonts.sansSb,
    fontSize: typography.bodyL.fontSize,
  },
  basketFooter: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    // No horizontal padding: the surfaces run edge to edge and the page shows
    // between them, which is what parts the sections now that nothing floats.
    paddingBottom: spacing[8],
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  title: {
    ...typography.h1,
  },
  itemCountBadge: {
    backgroundColor: colors.green[50],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
  },
  itemCountText: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
    color: colors.green[800],
  },

  /* Empty state */
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[8],
    gap: spacing[3],
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  emptyTitle: {
    ...typography.h2,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodyL,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 48,
    paddingHorizontal: spacing[6],
    marginTop: spacing[4],
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
    ...shadows.md,
  },
  emptyCtaText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },

  /* Supplier section card */
  supplierSection: {
    marginBottom: spacing[2],
  },
  supplierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  supplierIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supplierName: {
    ...typography.h3,
    flex: 1,
  },

  /* Item row */
  itemRow: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
  },
  itemImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemDetails: {
    flex: 1,
    gap: spacing[1],
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  itemName: {
    ...typography.bodyS,
    fontFamily: fonts.sansMd,
    flex: 1,
  },
  itemUnitPrice: {
    ...typography.caption,
  },
  variantRow: {
    gap: spacing[1],
    paddingVertical: spacing[1],
  },
  variantChip: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  variantChipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  variantChipText: {
    ...typography.caption,
  },
  variantChipTextActive: {
    color: colors.green[800],
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[1],
  },
  itemPrice: {
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '600',
  },
  removeButton: {
    width: 32,
    height: 32,
    // Pulled into the row's corner so the button aligns with the line's top
    // edge instead of pushing the name down.
    marginTop: -spacing[1],
    marginRight: -spacing[2],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },

  /* Promotion hint */
  promotionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
  },
  promotionHintText: {
    ...typography.caption,
    fontFamily: fonts.sansMd,
    flex: 1,
  },

  /* Delivery */
  deliverySection: {
    marginTop: spacing[2],
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  deliveryLabel: {
    ...typography.caption,
  },
  deliveryOptions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  deliveryOption: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  deliveryOptionActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  deliveryOptionText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  deliveryOptionTextActive: {
    color: colors.green[800],
  },

  /* Group footer */
  groupFooter: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    marginTop: spacing[3],
    borderTopWidth: 1,
    gap: spacing[3],
  },
  groupTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupTotalLabel: {
    ...typography.bodyS,
    fontFamily: fonts.sansMd,
  },
  groupTotalValue: {
    fontFamily: fonts.mono,
    fontSize: 17,
    fontWeight: '600',
  },
  orderButton: {
    flexDirection: 'row',
    height: 52,
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    // Without it the label and its arrow sit flush against the pill's edge.
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    gap: spacing[2],
    ...shadows.md,
  },
  orderButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },

  /* Grand total bar */
  grandTotalBar: {
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: Platform.OS === 'ios' ? spacing[6] : spacing[4],
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...shadows.lg,
  },
  grandTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  grandTotalLabel: {
    ...typography.bodyS,
  },
  grandTotalValue: {
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '700',
  },
  grandTotalItemCount: {
    backgroundColor: colors.green[50],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
  },
  grandTotalItemCountText: {
    ...typography.caption,
  },
})
