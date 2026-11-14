import type { TerroirPack, TerroirProduct } from '../terroir-api'
import * as Haptics from 'expo-haptics'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import ShoppingBasket from 'lucide-react-native/dist/esm/icons/shopping-basket'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { Thumbnail } from '../../common/components/thumbnail'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { fetchTerroirPack, fetchTerroirProduct, formatKg } from '../terroir-api'
import { useTerroirCart } from '../terroir-cart-context'
import { OriginBlock, originSentence, TerroirBadge, terroirStyles } from './terroir-ui'

interface PhotoStripProps {
  photos: string[]
  name: string
}

/** Swipeable photos at 4:3; a single placeholder frame when there are none. */
function PhotoStrip({ photos, name }: PhotoStripProps) {
  const { width } = useWindowDimensions()
  const frames = photos.length > 0 ? photos : [null]
  return (
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
      {frames.map((uri, index) => (
        <Thumbnail
          key={uri ?? 'none'}
          uri={uri}
          style={{ width, height: width * 3 / 4 }}
          alt={frames.length > 1 ? `${name}, photo ${index + 1} sur ${frames.length}` : name}
        />
      ))}
    </ScrollView>
  )
}

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
}

function QuantityStepper({ value, onChange }: QuantityStepperProps) {
  const { semantic } = useTheme()
  return (
    <View style={[styles.stepper, { borderColor: semantic.borderNormal }]}>
      <TouchableOpacity
        style={styles.stepperButton}
        onPress={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        accessibilityRole="button"
        accessibilityLabel="Diminuer la quantité"
      >
        <Minus size={18} color={value <= 1 ? semantic.textTertiary : semantic.textPrimary} />
      </TouchableOpacity>
      <Text style={[styles.stepperValue, { color: semantic.textPrimary }]} accessibilityLabel={`Quantité : ${value}`}>{value}</Text>
      <TouchableOpacity
        style={styles.stepperButton}
        onPress={() => onChange(Math.min(20, value + 1))}
        accessibilityRole="button"
        accessibilityLabel="Augmenter la quantité"
      >
        <Plus size={18} color={semantic.textPrimary} />
      </TouchableOpacity>
    </View>
  )
}

interface AddBarProps {
  priceLabel: string
  secondary: string | null
  quantity: number
  onQuantityChange: (value: number) => void
  disabled: boolean
  onAdd: () => void
}

function AddBar({ priceLabel, secondary, quantity, onQuantityChange, disabled, onAdd }: AddBarProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.addBar, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight, paddingBottom: insets.bottom + spacing[3] }]}>
      <QuantityStepper value={quantity} onChange={onQuantityChange} />
      <TouchableOpacity
        style={[terroirStyles.primaryButton, styles.addButton, disabled && terroirStyles.disabled]}
        onPress={onAdd}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={`Ajouter à ma valise, ${priceLabel}`}
      >
        <ShoppingBasket size={18} color={colors.neutral[0]} strokeWidth={2.2} />
        <View>
          <Text style={terroirStyles.primaryButtonText}>Ajouter au panier</Text>
          <Text style={styles.addPrice}>{secondary ? `${priceLabel} · ${secondary}` : priceLabel}</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}

interface InfoRowProps {
  label: string
  value: string
}

function InfoRow({ label, value }: InfoRowProps) {
  const { semantic } = useTheme()
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: semantic.textTertiary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: semantic.textPrimary }]}>{value}</Text>
    </View>
  )
}

function confirmAdded(name: string, onOpenCart: () => void): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
  appAlert('Ajouté à votre valise', name, [
    { text: 'Continuer', style: 'cancel' },
    { text: 'Voir le panier', onPress: onOpenCart },
  ])
}

interface TerroirProductScreenProps {
  productId: string
  onBack: () => void
  onOpenCart: () => void
}

export function TerroirProductScreen({ productId, onBack, onOpenCart }: TerroirProductScreenProps) {
  const { semantic } = useTheme()
  const { formatMoney, displayCurrency } = useTerroirMoney()
  const { addLine } = useTerroirCart()
  const [product, setProduct] = useState<TerroirProduct | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [variantId, setVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    let cancelled = false
    fetchTerroirProduct(productId, displayCurrency)
      .then((loaded) => {
        if (cancelled)
          return
        setProduct(loaded)
        setVariantId(loaded.variants[0]?.id ?? null)
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger ce produit.')
      })
    return () => {
      cancelled = true
    }
  }, [productId, displayCurrency])

  const variant = product?.variants.find(entry => entry.id === variantId) ?? null
  const unitPrice = variant?.price ?? product?.price ?? 0

  const handleAdd = useCallback(() => {
    if (!product)
      return
    addLine({
      kind: 'PRODUCT',
      productId: product.id,
      variantId: variant?.id ?? null,
      name: variant ? `${product.name}, ${variant.label}` : product.name,
      imageUrl: product.photos[0] ?? null,
      price: unitPrice,
      shopName: product.shopName,
      quantity,
    })
    confirmAdded(product.name, onOpenCart)
  }, [product, variant, unitPrice, quantity, addLine, onOpenCart])

  if (!product) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Produit du pays" onBack={onBack} />
        <View style={terroirStyles.centered}>
          {error
            ? <Text style={[terroirStyles.muted, { color: semantic.textSecondary }]}>{error}</Text>
            : <ActivityIndicator color={colors.green[400]} />}
        </View>
      </View>
    )
  }

  const money = formatMoney(unitPrice)
  const weightG = variant?.packedWeightG ?? product.packedWeightG
  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title={product.name} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <PhotoStrip photos={product.photos} name={product.name} />
        <View style={styles.body}>
          {product.badge && <TerroirBadge />}
          <Text style={[styles.title, { color: semantic.textPrimary }]}>{product.name}</Text>
          {product.shopName && <Text style={[styles.shop, { color: semantic.textSecondary }]}>{product.shopName}</Text>}
          <View>
            <Text style={[styles.price, { color: semantic.textPrimary }]}>{money.primary}</Text>
            {money.secondary && <Text style={[terroirStyles.priceSecondary, { color: semantic.textTertiary }]}>{money.secondary}</Text>}
          </View>

          {product.variants.length > 0 && (
            <View style={styles.variants} accessibilityRole="radiogroup">
              {product.variants.map((entry) => {
                const selected = entry.id === variantId
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={[
                      styles.variantChip,
                      selected
                        ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[600] }
                        : { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal },
                    ]}
                    onPress={() => setVariantId(entry.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.variantText, { color: selected ? semantic.textPrimaryColor : semantic.textPrimary }]}>
                      {selected ? `✓ ${entry.label}` : entry.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          {product.description && (
            <Text style={[styles.description, { color: semantic.textSecondary }]}>{product.description}</Text>
          )}

          {product.origin && <OriginBlock origin={product.origin} />}

          <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
            <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>Composition et conservation</Text>
            {product.ingredients && <InfoRow label="Ingrédients" value={product.ingredients} />}
            {product.allergens.length > 0 && <InfoRow label="Allergènes" value={product.allergens.join(', ')} />}
            {product.conservation && <InfoRow label="Conservation" value={product.conservation} />}
            {product.shelfLifeDays !== null && <InfoRow label="Durée de conservation" value={`${product.shelfLifeDays} jours`} />}
            {weightG !== null && <InfoRow label="Poids emballé" value={formatKg(weightG / 1000)} />}
            {!product.ingredients && product.allergens.length === 0 && !product.conservation && product.shelfLifeDays === null && weightG === null && (
              <Text style={[styles.description, { color: semantic.textSecondary }]}>Informations non renseignées.</Text>
            )}
          </View>
        </View>
      </ScrollView>
      <AddBar
        priceLabel={money.primary}
        secondary={money.secondary}
        quantity={quantity}
        onQuantityChange={setQuantity}
        disabled={false}
        onAdd={handleAdd}
      />
    </View>
  )
}

interface TerroirPackScreenProps {
  packId: string
  onBack: () => void
  onOpenCart: () => void
}

export function TerroirPackScreen({ packId, onBack, onOpenCart }: TerroirPackScreenProps) {
  const { semantic } = useTheme()
  const { formatMoney, displayCurrency } = useTerroirMoney()
  const { addLine } = useTerroirCart()
  const [pack, setPack] = useState<TerroirPack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [openOrigin, setOpenOrigin] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTerroirPack(packId, displayCurrency)
      .then((loaded) => {
        if (!cancelled)
          setPack(loaded)
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger ce pack.')
      })
    return () => {
      cancelled = true
    }
  }, [packId, displayCurrency])

  const handleAdd = useCallback(() => {
    if (!pack)
      return
    addLine({
      kind: 'PACK',
      packId: pack.id,
      name: pack.name,
      imageUrl: pack.photos[0] ?? pack.items[0]?.imageUrl ?? null,
      price: pack.price,
      shopName: pack.shopName ?? 'eBio',
      quantity,
    })
    confirmAdded(pack.name, onOpenCart)
  }, [pack, quantity, addLine, onOpenCart])

  if (!pack) {
    return (
      <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
        <ScreenHeader title="Pack du pays" onBack={onBack} />
        <View style={terroirStyles.centered}>
          {error
            ? <Text style={[terroirStyles.muted, { color: semantic.textSecondary }]}>{error}</Text>
            : <ActivityIndicator color={colors.green[400]} />}
        </View>
      </View>
    )
  }

  const money = formatMoney(pack.price)
  const photos = pack.photos.length > 0 ? pack.photos : pack.items.map(item => item.imageUrl).filter((url): url is string => url !== null)
  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title={pack.name} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <PhotoStrip photos={photos} name={pack.name} />
        <View style={styles.body}>
          {pack.badge && <TerroirBadge />}
          <Text style={[styles.overline, { color: colors.earth[600] }]}>{pack.shopName ? `Pack · ${pack.shopName}` : 'Pack eBio'}</Text>
          <Text style={[styles.title, { color: semantic.textPrimary }]}>{pack.name}</Text>
          <View>
            <Text style={[styles.price, { color: semantic.textPrimary }]}>{money.primary}</Text>
            {money.secondary && <Text style={[terroirStyles.priceSecondary, { color: semantic.textTertiary }]}>{money.secondary}</Text>}
          </View>
          {pack.description && (
            <Text style={[styles.description, { color: semantic.textSecondary }]}>{pack.description}</Text>
          )}
          {!pack.orderable && (
            <Text style={[styles.description, { color: colors.coral[600] }]}>
              Ce pack n’est plus disponible pour le moment : un de ses produits manque.
            </Text>
          )}

          <View style={[terroirStyles.card, { backgroundColor: semantic.bgCard }]}>
            <Text style={[terroirStyles.cardTitle, { color: semantic.textPrimary }]}>Dans ce pack</Text>
            {pack.items.map((item) => {
              const expanded = openOrigin === item.productId
              return (
                <View key={`${item.productId}-${item.name}`} style={styles.packItem}>
                  <View style={styles.packItemRow}>
                    <Thumbnail uri={item.imageUrl} style={styles.packItemImage} alt={item.name} />
                    <View style={styles.packItemText}>
                      <Text style={[styles.packItemName, { color: semantic.textPrimary }]}>{`${item.quantity} × ${item.name}`}</Text>
                      {item.shopName && <Text style={[styles.shop, { color: semantic.textSecondary }]}>{item.shopName}</Text>}
                      {item.origin && (
                        <Text style={[styles.packOrigin, { color: colors.earth[600] }]} numberOfLines={expanded ? undefined : 2}>
                          {originSentence(item.origin)}
                        </Text>
                      )}
                    </View>
                  </View>
                  {item.origin && (
                    <TouchableOpacity
                      style={styles.originToggle}
                      onPress={() => setOpenOrigin(expanded ? null : item.productId)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={expanded ? `Masquer l’origine de ${item.name}` : `Voir l’origine de ${item.name}`}
                    >
                      <Text style={[styles.originToggleText, { color: semantic.textPrimaryColor }]}>
                        {expanded ? 'Masquer l’origine' : 'Voir l’origine'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {expanded && item.origin && <OriginBlock origin={item.origin} title={`Origine, ${item.name}`} />}
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>
      <AddBar
        priceLabel={money.primary}
        secondary={money.secondary}
        quantity={quantity}
        onQuantityChange={setQuantity}
        disabled={!pack.orderable}
        onAdd={handleAdd}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing[8],
  },
  body: {
    padding: spacing[4],
    gap: spacing[3],
  },
  overline: {
    ...typography.overline,
  },
  title: {
    ...typography.h1,
  },
  shop: {
    ...typography.bodyS,
  },
  price: {
    fontFamily: fonts.mono,
    fontSize: 20,
  },
  description: {
    ...typography.bodyL,
  },
  variants: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  variantChip: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  variantText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    ...typography.overline,
  },
  infoValue: {
    ...typography.bodyS,
  },
  packItem: {
    gap: spacing[2],
  },
  packItemRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  packItemImage: {
    width: 64,
    height: 48,
    borderRadius: radius.sm,
  },
  packItemText: {
    flex: 1,
    gap: 2,
  },
  packItemName: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  packOrigin: {
    ...typography.caption,
  },
  originToggle: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  originToggleText: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
  },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
  },
  addButton: {
    flex: 1,
  },
  addPrice: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.neutral[0],
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 24,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 15,
  },
})
