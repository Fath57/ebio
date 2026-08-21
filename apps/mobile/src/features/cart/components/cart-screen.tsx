import ArrowRight from 'lucide-react-native/dist/esm/icons/arrow-right'
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
  name: string
  imageUrl: string | null
  pricePerUnit: number
  unit: string
  quantity: number
  selectedVariant: CartVariant | null
  availableVariants: CartVariant[]
}

interface SupplierCartGroup {
  supplierId: string
  supplierName: string
  items: CartItem[]
  deliveryMode: DeliveryMode
}

interface CartScreenProps {
  groups: SupplierCartGroup[]
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onSelectVariant: (itemId: string, variant: CartVariant) => void
  onChangeDeliveryMode: (supplierId: string, mode: DeliveryMode) => void
  onCheckout: (supplierId: string) => void
  onRemoveItem: (itemId: string) => void
  onContinueShopping?: () => void
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

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

  return (
    <View style={[quantityStyles.container, { backgroundColor: semantic.bgSurface }]}>
      <TouchableOpacity
        style={[quantityStyles.button, { backgroundColor: semantic.bgPage }]}
        onPress={onDecrease}
        accessibilityRole="button"
        accessibilityLabel="Diminuer la quantité"
      >
        <Minus size={16} color={semantic.textPrimary} />
      </TouchableOpacity>
      <Text style={[quantityStyles.value, { color: semantic.textPrimary }]}>{quantity}</Text>
      <TouchableOpacity
        style={[quantityStyles.button, quantityStyles.buttonPrimary]}
        onPress={onIncrease}
        accessibilityRole="button"
        accessibilityLabel="Augmenter la quantité"
      >
        <Plus size={16} color={colors.neutral[0]} />
      </TouchableOpacity>
    </View>
  )
}

const quantityStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.md,
    padding: 2,
  },
  button: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.green[400],
  },
  value: {
    fontFamily: fonts.mono,
    fontSize: 16,
    color: colors.neutral[800],
    minWidth: 28,
    textAlign: 'center',
  },
})

export function CartScreen({
  groups,
  onUpdateQuantity,
  onSelectVariant,
  onChangeDeliveryMode,
  onCheckout,
  onRemoveItem,
  onContinueShopping,
}: CartScreenProps) {
  const { semantic } = useTheme()

  const totalItemCount = groups.reduce(
    (sum, group) => sum + group.items.reduce((s, item) => s + item.quantity, 0),
    0,
  )

  if (groups.length === 0) {
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

  const grandTotal = groups.reduce(
    (sum, group) => sum + computeGroupTotal(group.items),
    0,
  )

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader
        title="Mon panier"
        subtitle={`${totalItemCount} article${totalItemCount > 1 ? 's' : ''}`}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {groups.map((group) => {
          const groupTotal = computeGroupTotal(group.items)

          return (
            <View
              key={group.supplierId}
              style={[
                styles.supplierSection,
                {
                  backgroundColor: semantic.bgCard,
                },
              ]}
            >
              {/* Supplier header */}
              <View style={styles.supplierHeader}>
                <View style={[styles.supplierIconCircle, { backgroundColor: semantic.bgPrimaryLight }]}>
                  <Store size={16} color={colors.green[600]} />
                </View>
                <Text style={[styles.supplierName, { color: semantic.textPrimary }]}>
                  {group.supplierName}
                </Text>
              </View>

              {group.items.map((item, index) => (
                <FadeInView key={item.id} delay={index * 80}>
                  <View
                    style={[
                      styles.itemRow,
                      index < group.items.length - 1 && [
                        styles.itemRowBorder,
                        { borderBottomColor: semantic.borderLight },
                      ],
                    ]}
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

                    <View style={styles.itemDetails}>
                      <View style={styles.itemTopRow}>
                        <Text style={[styles.itemName, { color: semantic.textPrimary }]} numberOfLines={2}>
                          {item.name}
                        </Text>
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => onRemoveItem(item.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Supprimer ${item.name}`}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Trash2 size={16} color={colors.coral[400]} />
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

              {/* Delivery mode */}
              <View style={styles.deliverySection}>
                <Text style={[styles.deliveryLabel, { color: semantic.textSecondary }]}>
                  Mode de livraison
                </Text>
                <View style={styles.deliveryOptions}>
                  <TouchableOpacity
                    style={[
                      styles.deliveryOption,
                      { borderColor: semantic.borderNormal },
                      group.deliveryMode === 'PICKUP' && [styles.deliveryOptionActive, { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[400] }],
                    ]}
                    onPress={() => onChangeDeliveryMode(group.supplierId, 'PICKUP')}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: group.deliveryMode === 'PICKUP' }}
                  >
                    <Store
                      size={16}
                      color={group.deliveryMode === 'PICKUP' ? colors.green[600] : semantic.textTertiary}
                    />
                    <Text
                      style={[
                        styles.deliveryOptionText,
                        { color: semantic.textSecondary },
                        group.deliveryMode === 'PICKUP' && [styles.deliveryOptionTextActive, { color: semantic.textPrimaryColor }],
                      ]}
                    >
                      Retrait sur place
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.deliveryOption,
                      { borderColor: semantic.borderNormal },
                      group.deliveryMode === 'DELIVERY' && [styles.deliveryOptionActive, { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[400] }],
                    ]}
                    onPress={() => onChangeDeliveryMode(group.supplierId, 'DELIVERY')}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: group.deliveryMode === 'DELIVERY' }}
                  >
                    <Truck
                      size={16}
                      color={group.deliveryMode === 'DELIVERY' ? colors.green[600] : semantic.textTertiary}
                    />
                    <Text
                      style={[
                        styles.deliveryOptionText,
                        { color: semantic.textSecondary },
                        group.deliveryMode === 'DELIVERY' && [styles.deliveryOptionTextActive, { color: semantic.textPrimaryColor }],
                      ]}
                    >
                      Livraison
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Group total + checkout */}
              <View style={[styles.groupFooter, { borderTopColor: semantic.borderLight }]}>
                <View style={styles.groupTotalRow}>
                  <Text style={[styles.groupTotalLabel, { color: semantic.textSecondary }]}>
                    Sous-total
                  </Text>
                  <Text style={[styles.groupTotalValue, { color: semantic.textPrimary }]}>
                    {formatPrice(groupTotal)}
                    {' '}
                    FCFA
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.orderButton}
                  onPress={() => onCheckout(group.supplierId)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Commander chez ${group.supplierName}`}
                >
                  <Text style={styles.orderButtonText}>Commander</Text>
                  <ArrowRight size={18} color={colors.neutral[0]} />
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* Grand total bar */}
      <FadeInView delay={300}>
        <View style={[styles.grandTotalBar, { backgroundColor: semantic.bgCard }]}>
          <View>
            <Text style={[styles.grandTotalLabel, { color: semantic.textSecondary }]}>
              Total général
            </Text>
            <Text style={[styles.grandTotalValue, { color: semantic.textPrimary }]}>
              {formatPrice(grandTotal)}
              {' '}
              FCFA
            </Text>
          </View>
          <View style={styles.grandTotalItemCount}>
            <Text style={[styles.grandTotalItemCountText, { color: semantic.textTertiary }]}>
              {totalItemCount}
              {' '}
              article
              {totalItemCount > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </FadeInView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: 80,
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
    borderRadius: radius.lg,
    marginBottom: spacing[4],
    overflow: 'hidden',
    ...shadows.sm,
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
    borderBottomWidth: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },

  /* Delivery */
  deliverySection: {
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
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
    minHeight: 48,
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    paddingBottom: Platform.OS === 'ios' ? spacing[6] : spacing[4],
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...shadows.lg,
  },
  grandTotalLabel: {
    ...typography.caption,
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
