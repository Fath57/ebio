import type { GestureResponderEvent } from 'react-native'
import type { TerroirCountry, TerroirExportability } from '../terroir-api'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import Check from 'lucide-react-native/dist/esm/icons/check'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import ShoppingBasket from 'lucide-react-native/dist/esm/icons/shopping-basket'
import X from 'lucide-react-native/dist/esm/icons/x'
import { use, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { DragSheet } from '../../common/components/drag-sheet'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { countryChipLabel } from '../terroir-api'
import { useTerroirCart } from '../terroir-cart-context'
import { useValiseMode } from '../valise-mode-context'
import { terroirStyles } from './terroir-ui'

const MAX_QUANTITY = 20

// ---------------------------------------------------------------------------
// Export chip

interface ExportChipProps {
  item: TerroirExportability
}

/** The product's export label: green when it can travel, neutral while checked, muted otherwise. */
export function ExportChip({ item }: ExportChipProps) {
  const { semantic } = useTheme()
  const palette = item.status === 'EXPORTABLE'
    ? { backgroundColor: colors.green[50], borderColor: colors.green[200], color: colors.green[800] }
    : item.status === 'PENDING'
      ? { backgroundColor: colors.blue[50], borderColor: colors.blue[100], color: colors.blue[800] }
      : { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal, color: semantic.textSecondary }
  return (
    <View
      style={[styles.chip, { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor }]}
      accessibilityRole="text"
      accessibilityLabel={item.label}
    >
      {item.status === 'EXPORTABLE' && <Plane size={11} color={palette.color} strokeWidth={2.4} />}
      <Text style={[styles.chipText, { color: palette.color }]} numberOfLines={1}>{item.label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Mode banner and country sheet

interface CountrySheetProps {
  visible: boolean
  onClose: () => void
}

function CountrySheet({ visible, onClose }: CountrySheetProps) {
  const { semantic } = useTheme()
  const { countries, country, setCountry } = useTerroirCart()
  const pick = (code: TerroirCountry): void => {
    setCountry(code)
    onClose()
  }
  return (
    <DragSheet visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        <Text style={[styles.sheetTitle, { color: semantic.textPrimary }]}>Où envoyer votre valise ?</Text>
        <Text style={[styles.sheetHint, { color: semantic.textSecondary }]}>
          Les produits, les prix et les départs s’adaptent au pays choisi.
        </Text>
        {countries === null && <ActivityIndicator color={colors.green[400]} />}
        <View accessibilityRole="radiogroup">
          {(countries ?? []).map((entry) => {
            const selected = entry.code === country
            return (
              <TouchableOpacity
                key={entry.code}
                style={[styles.sheetRow, { borderBottomColor: semantic.borderLight }]}
                onPress={() => pick(entry.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Valise ${entry.toPhrase}`}
              >
                <View style={styles.sheetRowText}>
                  <Text style={[styles.sheetRowName, { color: semantic.textPrimary }]}>{countryChipLabel(entry)}</Text>
                  <Text style={[styles.sheetRowSub, { color: semantic.textSecondary }]}>{`Valise ${entry.toPhrase}`}</Text>
                </View>
                {selected && <Check size={20} color={colors.green[600]} strokeWidth={2.4} />}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </DragSheet>
  )
}

/**
 * « ✈ Valise vers la France », at the top of the shopping screens while the
 * mode is on: a tap changes the country, the cross leaves the mode.
 */
export function ValiseModeBanner() {
  const { active, countryInfo, exit } = useValiseMode()
  const [open, setOpen] = useState(false)
  if (!active || !countryInfo)
    return null
  const title = `${countryInfo.flagEmoji ? `${countryInfo.flagEmoji} ` : ''}Valise ${countryInfo.toPhrase}`
  return (
    <View style={styles.banner}>
      <Pressable
        style={styles.bannerMain}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Valise ${countryInfo.toPhrase}. Changer de pays`}
      >
        <Plane size={18} color={colors.earth[800]} strokeWidth={2.2} />
        <Text style={styles.bannerText} numberOfLines={1}>{title}</Text>
        <ChevronDown size={16} color={colors.earth[800]} strokeWidth={2.4} />
      </Pressable>
      <Pressable
        style={styles.bannerClose}
        onPress={exit}
        accessibilityRole="button"
        accessibilityLabel="Quitter le mode Valise"
      >
        <X size={20} color={colors.earth[800]} strokeWidth={2.4} />
      </Pressable>
      <CountrySheet visible={open} onClose={() => setOpen(false)} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Card action

interface ValiseCardActionProps {
  productId: string
  name: string
  imageUrl: string | null
  /** FCFA, as shown on the card; the preview reprices it. */
  price: number
  shopName: string | null
}

/** The card's « + », filling the valise: a stepper once the product is in it. */
export function ValiseCardAction({ productId, name, imageUrl, price, shopName }: ValiseCardActionProps) {
  const { lines, addLine, setQuantity } = useTerroirCart()
  const key = `P:${productId}:`
  const line = lines.find(entry => entry.key === key) ?? null

  const handleAdd = (event: GestureResponderEvent): void => {
    event.stopPropagation()
    if (line) {
      setQuantity(key, line.quantity + 1)
      return
    }
    addLine({ kind: 'PRODUCT', productId, variantId: null, name, imageUrl, price, shopName, quantity: 1 })
  }

  const handleRemove = (event: GestureResponderEvent): void => {
    event.stopPropagation()
    if (line)
      setQuantity(key, line.quantity - 1)
  }

  if (!line) {
    return (
      <Pressable
        onPress={handleAdd}
        hitSlop={6}
        style={({ pressed }) => [styles.cardAdd, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Ajouter ${name} à ma valise`}
      >
        <Plus size={18} color={colors.neutral[0]} strokeWidth={2.8} />
      </Pressable>
    )
  }

  const atMax = line.quantity >= MAX_QUANTITY
  return (
    <View style={styles.cardStepper}>
      <Pressable
        onPress={handleRemove}
        hitSlop={6}
        style={styles.cardStepperButton}
        accessibilityRole="button"
        accessibilityLabel={line.quantity === 1 ? 'Retirer de ma valise' : 'Diminuer la quantité'}
      >
        <Minus size={13} color={colors.neutral[0]} strokeWidth={2.8} />
      </Pressable>
      <Text style={styles.cardStepperValue}>{line.quantity}</Text>
      <Pressable
        onPress={handleAdd}
        hitSlop={6}
        disabled={atMax}
        style={[styles.cardStepperButton, atMax && terroirStyles.disabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: atMax }}
        accessibilityLabel="Augmenter la quantité"
      >
        <Plus size={13} color={colors.neutral[0]} strokeWidth={2.8} />
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Product page footer

interface ValiseAddBarProps {
  /** Null while the server has not answered. */
  exportability: TerroirExportability | null
  /** FCFA per unit of the chosen format. */
  unitPrice: number
  /** Out of stock: nothing to add, whatever the export says. */
  outOfStock: boolean
  onAdd: (quantity: number) => void
}

/**
 * The product page's footer in Valise mode, above the floating tab bar: a
 * quantity, « Ajouter à ma valise » with the total for that quantity, or the
 * reason the product cannot travel.
 */
export function ValiseAddBar({ exportability, unitPrice, outOfStock, onAdd }: ValiseAddBarProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  // The floating tab bar covers the bottom of the screen: the footer sits above it.
  const tabBarHeight = use(BottomTabBarHeightContext) ?? 0
  const { formatMoney } = useTerroirMoney()
  const [quantity, setQuantity] = useState(1)
  const barStyle = [styles.addBar, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight, paddingBottom: (tabBarHeight || insets.bottom) + spacing[3] }]

  if (exportability === null) {
    return (
      <View style={barStyle}>
        <ActivityIndicator color={colors.green[400]} />
        <Text style={[styles.barNote, { color: semantic.textSecondary }]}>Vérification de l’export…</Text>
      </View>
    )
  }

  if (exportability.status !== 'EXPORTABLE' || outOfStock) {
    const reason = outOfStock && exportability.status === 'EXPORTABLE'
      ? 'Ce produit est en rupture pour le moment.'
      : exportability.reason
    return (
      <View style={[barStyle, styles.addBarColumn]}>
        {exportability.status === 'EXPORTABLE'
          ? <ExportChip item={{ ...exportability, status: 'UNAVAILABLE', label: 'Indisponible' }} />
          : <ExportChip item={exportability} />}
        {reason && <Text style={[styles.barNote, { color: semantic.textSecondary }]}>{reason}</Text>}
      </View>
    )
  }

  // The total is converted as a whole: 2 × 0,94 € shows 1,87 € when that is
  // what the FCFA amount comes to.
  const total = formatMoney(unitPrice * quantity)
  return (
    <View style={barStyle}>
      <View style={[styles.stepper, { borderColor: semantic.borderNormal }]}>
        <TouchableOpacity
          style={styles.stepperButton}
          onPress={() => setQuantity(value => Math.max(1, value - 1))}
          disabled={quantity <= 1}
          accessibilityRole="button"
          accessibilityLabel="Diminuer la quantité"
        >
          <Minus size={18} color={quantity <= 1 ? semantic.textTertiary : semantic.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.stepperValue, { color: semantic.textPrimary }]} accessibilityLabel={`Quantité : ${quantity}`}>{quantity}</Text>
        <TouchableOpacity
          style={styles.stepperButton}
          onPress={() => setQuantity(value => Math.min(MAX_QUANTITY, value + 1))}
          disabled={quantity >= MAX_QUANTITY}
          accessibilityRole="button"
          accessibilityLabel="Augmenter la quantité"
        >
          <Plus size={18} color={quantity >= MAX_QUANTITY ? semantic.textTertiary : semantic.textPrimary} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[terroirStyles.primaryButton, styles.addButton]}
        onPress={() => onAdd(quantity)}
        accessibilityRole="button"
        accessibilityLabel={`Ajouter ${quantity} à ma valise, ${total.primary}`}
      >
        <ShoppingBasket size={18} color={colors.neutral[0]} strokeWidth={2.2} />
        <View style={styles.addButtonText}>
          <Text style={terroirStyles.primaryButtonText} numberOfLines={1}>Ajouter à ma valise</Text>
          <Text style={styles.addPrice} numberOfLines={1}>{total.secondary ? `${total.primary} · ${total.secondary}` : total.primary}</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 22,
    paddingHorizontal: spacing[2],
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    flexShrink: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    paddingLeft: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.earth[200],
    backgroundColor: colors.earth[50],
  },
  bannerMain: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  bannerText: {
    flexShrink: 1,
    fontFamily: fonts.sansBd,
    fontSize: 14,
    color: colors.earth[800],
  },
  bannerClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    gap: spacing[3],
  },
  sheetTitle: {
    ...typography.h3,
  },
  sheetHint: {
    ...typography.bodyS,
  },
  sheetRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetRowText: {
    flex: 1,
    gap: 2,
  },
  sheetRowName: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
  },
  sheetRowSub: {
    ...typography.caption,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  cardAdd: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.green[600],
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  cardStepperButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStepperValue: {
    fontFamily: fonts.sansBd,
    fontSize: 12,
    color: colors.neutral[0],
    minWidth: 14,
    textAlign: 'center',
  },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
  },
  addBarColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  barNote: {
    ...typography.bodyS,
    flexShrink: 1,
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
  addButton: {
    flex: 1,
  },
  addButtonText: {
    flexShrink: 1,
  },
  addPrice: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.neutral[0],
  },
})
