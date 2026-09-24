import type { RecommendationReason, RecommendedProduct } from '../hooks/use-recommendations'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import * as React from 'react'
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { PromotionChips } from '../../catalog/components/promotion-chips'
import { unitShortLabel } from '../../catalog/hooks/use-product-units'
import { promotionChipLabels } from '../../catalog/promotions'
import { MAX_ITEM_QUANTITY, useCart } from '../cart-context'
import { useRecommendations } from '../hooks/use-recommendations'

const REASON_LABELS: Record<RecommendationReason, string> = {
  BOUGHT_TOGETHER: 'Souvent acheté avec vos articles',
  PROMO: 'En promotion',
  POPULAR: 'Populaire',
  NEW: 'Nouveau',
}

/**
 * Le motif dépend de l'écran où la carte apparaît. « Souvent acheté avec vos
 * articles » n'a de sens qu'en regard d'un panier ; sur une fiche produit, le
 * lien est la boutique.
 */
export type ReasonLabels = Partial<Record<RecommendationReason, string>>

/**
 * Une carte fait toujours un peu moins du tiers de la largeur utile, de sorte
 * que la suivante dépasse du bord.
 *
 * C'est le seul signal fiable qu'un rail se fait défiler : une largeur fixe
 * tombait juste sur certains écrans, la dernière carte s'arrêtait pile au bord,
 * et le rail se lisait comme une grille figée. Les bornes gardent la carte
 * lisible sur un petit téléphone et raisonnable sur une tablette.
 */
const RAIL_GAP = 8
const VISIBLE_CARDS = 2.35

function cardWidthFor(screenWidth: number): number {
  const available = screenWidth - RAIL_GAP * 2
  return Math.round(Math.min(170, Math.max(128, available / VISIBLE_CARDS)))
}

function formatPrice(value: number): string {
  return value.toLocaleString('fr-FR').replace(/,/g, ' ')
}

interface BasketSuggestionsProps {
  supplierId: string | null
  /** When given, each card offers "+ Ajouter" into this shop's basket. */
  supplierName?: string
  /** Products already in hand: excluded from the suggestions. */
  productIds: string[]
  title?: string
  limit?: number
  /** Makes the card itself open the product. */
  onOpenProduct?: (productId: string) => void
  /** Already-fetched suggestions; skips the request when the caller has them. */
  items?: RecommendedProduct[]
  /** Hides the section heading when the surrounding screen already has one. */
  hideTitle?: boolean
  /** Remplace le motif affiché sur la carte, selon l'écran d'accueil. */
  reasonLabels?: ReasonLabels
}

interface SuggestionCardProps {
  item: RecommendedProduct
  /** Calculée depuis la largeur de l'écran, pour que la suivante dépasse. */
  width: number
  /** Ce qu'il y a déjà dans le panier pour ce produit ; 0 s'il n'y est pas. */
  quantity: number
  onAdd: ((item: RecommendedProduct) => void) | null
  /** Change la quantité d'une ligne déjà là ; 0 la retire. */
  onChangeQuantity: ((item: RecommendedProduct, next: number) => void) | null
  onOpen: ((productId: string) => void) | null
  reasonLabels: ReasonLabels
}

function SuggestionCard({ item, quantity, onAdd, onChangeQuantity, onOpen, reasonLabels, width }: SuggestionCardProps) {
  const { semantic } = useTheme()
  const hasPromo = item.promotionalPrice !== null && item.promotionalPrice < item.pricePerUnit
  const displayPrice = hasPromo ? item.promotionalPrice ?? item.pricePerUnit : item.pricePerUnit
  const imageUri = item.thumbnail ?? item.photo
  return (
    <TouchableOpacity
      style={[styles.card, { width, backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}
      onPress={onOpen ? () => onOpen(item.id) : undefined}
      disabled={!onOpen}
      activeOpacity={0.8}
      accessibilityRole={onOpen ? 'button' : undefined}
      accessibilityLabel={`${item.name}, ${formatPrice(displayPrice)} FCFA`}
    >
      {imageUri
        ? <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        : (
            <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: semantic.bgCard }]}>
              <Package size={22} color={semantic.textTertiary} strokeWidth={1.5} />
            </View>
          )}
      <Text style={[styles.reason, { color: semantic.textTertiary }]} numberOfLines={1}>
        {reasonLabels[item.reason] ?? REASON_LABELS[item.reason]}
      </Text>
      <Text style={[styles.name, { color: semantic.textPrimary }]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[styles.price, hasPromo && styles.pricePromo]}>
        {`${formatPrice(displayPrice)} FCFA`}
        <Text style={[styles.unit, { color: semantic.textTertiary }]}>{` / ${unitShortLabel(item.unit)}`}</Text>
      </Text>
      {hasPromo && (
        <Text style={[styles.priceOld, { color: semantic.textTertiary }]}>{`${formatPrice(item.pricePerUnit)} FCFA`}</Text>
      )}
      <PromotionChips labels={promotionChipLabels(item.promotionTypes)} maxVisible={2} />
      {/*
        * Une fois l'article pris, le bouton devient un compteur : une
        * suggestion ne se prend pas toujours à l'unité, et il fallait sinon
        * quitter la caisse pour passer de un à trois kilos.
        */}
      {onAdd && quantity === 0 && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => onAdd(item)}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter ${item.name} au panier`}
        >
          <Plus size={14} color={colors.neutral[0]} strokeWidth={2.5} />
          <Text style={styles.addButtonText}>Ajouter</Text>
        </TouchableOpacity>
      )}

      {onChangeQuantity && quantity > 0 && (
        <View style={[styles.stepper, { borderColor: semantic.borderNormal }]}>
          <TouchableOpacity
            style={styles.stepButton}
            onPress={() => onChangeQuantity(item, quantity - 1)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={quantity === 1
              ? `Retirer ${item.name} du panier`
              : `Enlever un ${item.name}`}
          >
            {quantity === 1
              ? <Trash2 size={14} color={colors.coral[400]} strokeWidth={2.4} />
              : <Minus size={14} color={semantic.textPrimary} strokeWidth={2.6} />}
          </TouchableOpacity>

          <Text style={[styles.stepQuantity, { color: semantic.textPrimary }]}>
            {`${quantity} ${unitShortLabel(item.unit)}`}
          </Text>

          <TouchableOpacity
            style={styles.stepButton}
            onPress={() => onChangeQuantity(item, quantity + 1)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Ajouter un ${item.name}`}
          >
            <Plus size={14} color={semantic.textPrimary} strokeWidth={2.6} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  )
}

/** Horizontal rail of same-shop products to add next to the basket. Renders nothing without suggestions. */
export function BasketSuggestions({
  supplierId,
  supplierName,
  productIds,
  title = 'Complétez votre panier',
  limit = 4,
  onOpenProduct,
  items: providedItems,
  hideTitle = false,
  reasonLabels = {},
}: BasketSuggestionsProps) {
  const { semantic } = useTheme()
  const { width: screenWidth } = useWindowDimensions()
  const cardWidth = cardWidthFor(screenWidth)
  const { items: cartItems, addItem, updateQuantity, removeItem } = useCart()
  // The caller may already hold the list (the checkout upsell does): asking
  // again would just duplicate the request.
  const fetched = useRecommendations(providedItems ? null : supplierId, productIds, limit)
  const items = providedItems ?? fetched.items

  if (items.length === 0 || supplierId === null) {
    return null
  }

  // La ligne du panier, pas seulement sa présence : c'est elle qui porte la
  // quantité à afficher et l'identifiant qu'attendent `updateQuantity` et
  // `removeItem`.
  const cartLineFor = (productId: string) =>
    cartItems.find(line => line.productId === productId && line.supplierId === supplierId) ?? null

  const handleChangeQuantity = (item: RecommendedProduct, next: number): void => {
    const line = cartLineFor(item.id)
    if (line === null) {
      return
    }
    if (next <= 0) {
      removeItem(line.id)
      return
    }
    updateQuantity(line.id, Math.min(next, MAX_ITEM_QUANTITY))
  }

  const handleAdd = supplierName
    ? (item: RecommendedProduct) => {
        addItem({
          productId: item.id,
          supplierId,
          supplierName,
          name: item.name,
          imageUrl: item.thumbnail ?? item.photo,
          pricePerUnit: item.promotionalPrice ?? item.pricePerUnit,
          unit: item.unit,
          quantity: 1,
          promotionTypes: item.promotionTypes,
        })
      }
    : null

  return (
    <View style={styles.container}>
      {hideTitle ? null : <Text style={[styles.title, { color: semantic.textPrimary }]}>{title}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {items.map(item => (
          <SuggestionCard
            key={item.id}
            width={cardWidth}
            item={item}
            quantity={cartLineFor(item.id)?.quantity ?? 0}
            onAdd={handleAdd}
            onChangeQuantity={supplierName ? handleChangeQuantity : null}
            onOpen={onOpenProduct ?? null}
            reasonLabels={reasonLabels}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[2],
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing[1],
  },
  stepButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepQuantity: {
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  container: {
    gap: spacing[2],
  },
  title: {
    ...typography.h3,
  },
  rail: {
    gap: spacing[2],
    paddingVertical: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing[2],
    gap: 4,
  },
  image: {
    width: '100%',
    height: 90,
    borderRadius: radius.sm,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reason: {
    fontFamily: fonts.sansMd,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  name: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
    lineHeight: 13 * 1.35,
    minHeight: 13 * 1.35 * 2,
  },
  price: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.green[800],
  },
  pricePromo: {
    color: colors.coral[400],
  },
  unit: {
    fontFamily: fonts.sans,
    fontSize: 10,
  },
  priceOld: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textDecorationLine: 'line-through',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 32,
    marginTop: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.green[400],
  },
  addButtonDone: {
    backgroundColor: colors.green[50],
  },
  addButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 12,
    color: colors.neutral[0],
  },
  addButtonTextDone: {
    color: colors.green[800],
  },
})
