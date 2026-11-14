import type { TerroirPack } from '../terroir-api'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import * as Haptics from 'expo-haptics'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import ShoppingBasket from 'lucide-react-native/dist/esm/icons/shopping-basket'
import { use, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { Thumbnail } from '../../common/components/thumbnail'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { fetchTerroirPack } from '../terroir-api'
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
  /** FCFA per unit: the button shows the total for the quantity. */
  unitPrice: number
  quantity: number
  onQuantityChange: (value: number) => void
  disabled: boolean
  onAdd: () => void
}

function AddBar({ unitPrice, quantity, onQuantityChange, disabled, onAdd }: AddBarProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const { formatMoney } = useTerroirMoney()
  // Converted as a whole: 2 × 0,94 € shows what the FCFA total comes to.
  const total = formatMoney(unitPrice * quantity)
  // The floating tab bar covers the bottom of the screen: the footer sits above it.
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  return (
    <View style={[styles.addBar, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight, paddingBottom: (tabBarHeight || insets.bottom) + spacing[3] }]}>
      <QuantityStepper value={quantity} onChange={onQuantityChange} />
      <TouchableOpacity
        style={[terroirStyles.primaryButton, styles.addButton, disabled && terroirStyles.disabled]}
        onPress={onAdd}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={`Ajouter ${quantity} à ma valise, ${total.primary}`}
      >
        <ShoppingBasket size={18} color={colors.neutral[0]} strokeWidth={2.2} />
        <View>
          <Text style={terroirStyles.primaryButtonText}>Ajouter à ma valise</Text>
          <Text style={styles.addPrice}>{total.secondary ? `${total.primary} · ${total.secondary}` : total.primary}</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}

function confirmAdded(name: string, onOpenCart: () => void): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined)
  appAlert('Ajouté à votre valise', name, [
    { text: 'Continuer', style: 'cancel' },
    { text: 'Voir ma valise', onPress: onOpenCart },
  ])
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
        unitPrice={pack.price}
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
