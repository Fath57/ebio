import type { RecommendationReason, RecommendedProduct } from '../hooks/use-recommendations'
import Check from 'lucide-react-native/dist/esm/icons/check'
import Package from 'lucide-react-native/dist/esm/icons/package'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import * as React from 'react'
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { PromotionChips } from '../../catalog/components/promotion-chips'
import { unitShortLabel } from '../../catalog/hooks/use-product-units'
import { promotionChipLabels } from '../../catalog/promotions'
import { useCart } from '../cart-context'
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

const CARD_WIDTH = 150

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
  inCart: boolean
  onAdd: ((item: RecommendedProduct) => void) | null
  onOpen: ((productId: string) => void) | null
  reasonLabels: ReasonLabels
}

function SuggestionCard({ item, inCart, onAdd, onOpen, reasonLabels }: SuggestionCardProps) {
  const { semantic } = useTheme()
  const hasPromo = item.promotionalPrice !== null && item.promotionalPrice < item.pricePerUnit
  const displayPrice = hasPromo ? item.promotionalPrice ?? item.pricePerUnit : item.pricePerUnit
  const imageUri = item.thumbnail ?? item.photo
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}
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
      {onAdd && (
        <TouchableOpacity
          style={[styles.addButton, inCart && styles.addButtonDone]}
          onPress={() => onAdd(item)}
          disabled={inCart}
          accessibilityRole="button"
          accessibilityState={{ disabled: inCart }}
          accessibilityLabel={inCart ? `${item.name} ajouté au panier` : `Ajouter ${item.name} au panier`}
        >
          {inCart
            ? <Check size={14} color={colors.green[800]} strokeWidth={2.5} />
            : <Plus size={14} color={colors.neutral[0]} strokeWidth={2.5} />}
          <Text style={[styles.addButtonText, inCart && styles.addButtonTextDone]}>
            {inCart ? 'Ajouté' : 'Ajouter'}
          </Text>
        </TouchableOpacity>
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
  const { groups, addItem } = useCart()
  // The caller may already hold the list (the checkout upsell does): asking
  // again would just duplicate the request.
  const fetched = useRecommendations(providedItems ? null : supplierId, productIds, limit)
  const items = providedItems ?? fetched.items

  if (items.length === 0 || supplierId === null) {
    return null
  }

  const cartProductIds = new Set(
    groups.filter(g => g.supplierId === supplierId).flatMap(g => g.items.map(i => i.productId)),
  )

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
            item={item}
            inCart={cartProductIds.has(item.id)}
            onAdd={handleAdd}
            onOpen={onOpenProduct ?? null}
            reasonLabels={reasonLabels}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
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
    width: CARD_WIDTH,
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
