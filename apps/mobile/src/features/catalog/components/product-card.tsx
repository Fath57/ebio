import * as React from 'react'
import { useMemo } from 'react'
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Leaf from 'lucide-react-native/dist/esm/icons/leaf'
import { colors, fonts, radius, shadows, spacing, typography } from '../../../theme/theme'
import { ScalePressable } from '../../../utils/animations'
import { useCart } from '../../cart/cart-context'

interface ProductCardProps {
  id: string
  name: string
  imageUrl: string | null
  pricePerUnit: number
  promotionalPrice: number | null
  unit: string
  isInStock: boolean
  categoryName?: string
  supplierId?: string
  supplierName?: string
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
  categoryName,
  supplierId,
  supplierName,
  onPress,
}: ProductCardProps) {
  const { groups, addItem, updateQuantity } = useCart()

  const hasPromo = promotionalPrice !== null && promotionalPrice < pricePerUnit
  const displayPrice = hasPromo ? promotionalPrice : pricePerUnit
  const discount = hasPromo ? Math.round((1 - promotionalPrice! / pricePerUnit) * 100) : 0

  const cartItem = useMemo(() => {
    for (const group of groups) {
      const found = group.items.find(i => i.productId === id)
      if (found) return found
    }
    return null
  }, [groups, id])

  const cartEnabled = Boolean(supplierId && supplierName)

  function handleAdd(e: any) {
    e.stopPropagation()
    if (!cartEnabled || !isInStock) return
    if (cartItem) {
      updateQuantity(cartItem.id, cartItem.quantity + 1)
    } else {
      addItem({
        productId: id,
        supplierId: supplierId!,
        supplierName: supplierName!,
        name,
        imageUrl,
        pricePerUnit: displayPrice,
        unit,
        quantity: 1,
      })
    }
  }

  function handleRemove(e: any) {
    e.stopPropagation()
    if (!cartItem) return
    updateQuantity(cartItem.id, cartItem.quantity - 1)
  }

  return (
    <ScalePressable
      style={styles.card}
      onPress={() => onPress(id)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${formatPrice(displayPrice)} FCFA par ${unit}`}
    >
      {/* ─── Image ────────────────────────────────────────────────────────── */}
      <View style={styles.imageWrap}>
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

        {/* Top-left bio mark */}
        <View style={styles.bioMark}>
          <Leaf size={10} color={colors.green[800]} strokeWidth={2.5} />
        </View>

        {/* Top-right promo */}
        {hasPromo && (
          <View style={styles.promoBadge}>
            <Text style={styles.promoText}>−{discount}%</Text>
          </View>
        )}

        {/* Out of stock scrim */}
        {!isInStock && (
          <View style={styles.outOfStockScrim}>
            <Text style={styles.outOfStockText}>Rupture</Text>
          </View>
        )}
      </View>

      {/* ─── Content ──────────────────────────────────────────────────────── */}
      <View style={styles.content}>
        {categoryName && (
          <Text style={styles.categoryOverline} numberOfLines={1}>
            {categoryName.toUpperCase()}
          </Text>
        )}

        <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
          {name}
        </Text>

        <View style={styles.priceRow}>
          <View style={styles.priceCol}>
            <Text style={[styles.price, hasPromo && styles.pricePromo]}>
              {formatPrice(displayPrice)}
              <Text style={styles.priceCurrency}> FCFA</Text>
            </Text>
            <Text style={styles.unitLabel}>
              /{unit}
              {hasPromo && (
                <Text style={styles.originalPrice}>
                  {'  '}
                  {formatPrice(pricePerUnit)}
                </Text>
              )}
            </Text>
          </View>

          {/* Cart action — inline, right side */}
          {cartEnabled && isInStock && (
            cartItem ? (
              <View style={styles.stepper}>
                <Pressable
                  onPress={handleRemove}
                  hitSlop={6}
                  style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Diminuer la quantité"
                >
                  <Minus size={13} color={colors.neutral[0]} strokeWidth={2.8} />
                </Pressable>
                <Text style={styles.stepperValue}>{cartItem.quantity}</Text>
                <Pressable
                  onPress={handleAdd}
                  hitSlop={6}
                  style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Augmenter la quantité"
                >
                  <Plus size={13} color={colors.neutral[0]} strokeWidth={2.8} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={handleAdd}
                hitSlop={6}
                style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${name} au panier`}
              >
                <Plus size={18} color={colors.neutral[0]} strokeWidth={2.8} />
              </Pressable>
            )
          )}
        </View>
      </View>
    </ScalePressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.neutral[0],
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.neutral[100],
    ...shadows.sm,
  },

  // Image
  imageWrap: {
    position: 'relative',
    width: '100%',
    height: 150,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.neutral[50],
  },
  imagePlaceholder: {
    backgroundColor: colors.green[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontFamily: fonts.display,
    fontSize: 40,
    color: colors.green[200],
  },
  bioMark: {
    position: 'absolute',
    top: spacing[2],
    left: spacing[2],
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBadge: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    backgroundColor: colors.coral[400],
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  promoText: {
    fontFamily: fonts.sansBd,
    fontSize: 10,
    color: colors.neutral[0],
    letterSpacing: 0.3,
  },
  outOfStockScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,20,16,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockText: {
    fontFamily: fonts.sansBd,
    fontSize: 13,
    color: colors.neutral[0],
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Content
  content: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    gap: 4,
  },
  categoryOverline: {
    fontFamily: fonts.sansSb,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.neutral[400],
  },
  name: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
    color: colors.neutral[800],
    lineHeight: 13 * 1.35,
    minHeight: 13 * 1.35 * 2,
  },

  // Price row (with inline cart action)
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing[2],
    gap: spacing[2],
  },
  priceCol: {
    flex: 1,
    gap: 1,
  },
  price: {
    fontFamily: fonts.mono,
    fontSize: 15,
    lineHeight: 15 * 1.15,
    letterSpacing: -0.2,
    color: colors.green[800],
  },
  pricePromo: {
    color: colors.coral[400],
  },
  priceCurrency: {
    fontFamily: fonts.sansSb,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  unitLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.neutral[400],
  },
  originalPrice: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.neutral[400],
    textDecorationLine: 'line-through',
  },

  // Add button
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green[600],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green[900],
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },

  // Stepper (inline, replaces add button when item in cart)
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.green[600],
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
    shadowColor: colors.green[900],
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  stepperValue: {
    fontFamily: fonts.sansBd,
    fontSize: 12,
    color: colors.neutral[0],
    minWidth: 14,
    textAlign: 'center',
  },
})
