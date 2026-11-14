import type { GestureResponderEvent } from 'react-native'
import type { TerroirExportability } from '../terroir-api'
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs'
import Luggage from 'lucide-react-native/dist/esm/icons/luggage'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Plane from 'lucide-react-native/dist/esm/icons/plane'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import { use, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useTerroirMoney } from '../hooks/use-terroir-money'
import { useTerroirCart } from '../terroir-cart-context'
import { terroirStyles } from './terroir-ui'
import { LuggageTag } from './valise/luggage-tag'
import { useValisePalette } from './valise/valise-palette'

export { ValiseModeBanner } from './valise/valise-banner'

const MAX_QUANTITY = 20

// ---------------------------------------------------------------------------
// Export chip

interface ExportChipProps {
  item: TerroirExportability
}

/**
 * The product's export label. « Exportable » is a small rubber stamp, tilted
 * as if inked by hand at the agency; while checked it is a quiet blue tag;
 * otherwise a muted dashed tag that does not compete with the product.
 */
export function ExportChip({ item }: ExportChipProps) {
  const { semantic, isDark } = useTheme()
  if (item.status === 'EXPORTABLE') {
    const ink = isDark ? colors.blue[200] : colors.blue[600]
    return (
      <View
        style={[styles.stamp, { borderColor: ink, backgroundColor: isDark ? colors.blue[900] : colors.blue[50] }]}
        accessibilityRole="text"
        accessibilityLabel={item.label}
      >
        <View style={[styles.stampInner, { borderColor: ink }]}>
          <Plane size={10} color={ink} strokeWidth={2.4} />
          <Text style={[styles.stampText, { color: ink }]} numberOfLines={1}>{item.label}</Text>
        </View>
      </View>
    )
  }
  const pending = item.status === 'PENDING'
  const palette = pending
    ? { borderColor: isDark ? colors.blue[400] : colors.blue[200], color: isDark ? colors.blue[100] : colors.blue[800] }
    : { borderColor: semantic.borderNormal, color: semantic.textSecondary }
  return (
    <View
      style={[styles.chip, { borderColor: palette.borderColor }]}
      accessibilityRole="text"
      accessibilityLabel={item.label}
    >
      <Text style={[styles.chipText, { color: palette.color }]} numberOfLines={1}>{item.label}</Text>
    </View>
  )
}

interface ExportReasonTagProps {
  label: string
  reason: string | null
}

/** Why a product stays home, written on a luggage tag. */
export function ExportReasonTag({ label, reason }: ExportReasonTagProps) {
  const palette = useValisePalette()
  return (
    <LuggageTag
      colors={{ fill: palette.paper, stroke: palette.paperEdge, hole: palette.page, ring: palette.leather, string: palette.inkSoft }}
      dashed
      style={styles.reasonTag}
      contentStyle={styles.reasonContent}
    >
      <Text style={[styles.reasonLabel, { color: palette.ink }]}>{label}</Text>
      {reason && <Text style={[styles.reasonText, { color: palette.inkSoft }]}>{reason}</Text>}
    </LuggageTag>
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
    const label = exportability.status === 'EXPORTABLE' ? 'Indisponible' : exportability.label
    return (
      <View style={[barStyle, styles.addBarColumn]}>
        <ExportReasonTag label={label} reason={reason} />
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
        <Luggage size={18} color={colors.neutral[0]} strokeWidth={2.2} />
        <View style={styles.addButtonText}>
          <Text style={terroirStyles.primaryButtonText} numberOfLines={1}>Ajouter à ma valise</Text>
          <Text style={styles.addPrice} numberOfLines={1}>{total.secondary ? `${total.primary} · ${total.secondary}` : total.primary}</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  stamp: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: radius.xs,
    padding: 1.5,
    marginVertical: 2,
    marginLeft: 2,
    transform: [{ rotate: '-4deg' }],
    maxWidth: '100%',
  },
  stampInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 18,
    paddingHorizontal: spacing[1],
    borderWidth: 1,
    borderRadius: 2,
  },
  stampText: {
    fontFamily: fonts.sansBd,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 22,
    paddingHorizontal: spacing[2],
    borderRadius: radius.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    maxWidth: '100%',
  },
  chipText: {
    fontFamily: fonts.sansSb,
    fontSize: 11,
    flexShrink: 1,
  },
  reasonTag: {
    alignSelf: 'stretch',
  },
  reasonContent: {
    paddingVertical: spacing[3],
    paddingRight: spacing[4],
    gap: 2,
  },
  reasonLabel: {
    fontFamily: fonts.sansBd,
    fontSize: 14,
  },
  reasonText: {
    ...typography.bodyS,
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
