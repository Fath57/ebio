import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useMoney } from '../../common/hooks/use-money'

/** A way to buy the product: the plain unit, a pack, a size. */
export interface ProductFormat {
  /** Variant id; null for the plain unit. */
  id: string | null
  label: string
  price: number
  /** Units in one pack, null otherwise. */
  packSize: number | null
  /** Sellable quantity of this format. */
  stock: number
}

interface FormatPickerProps {
  formats: ProductFormat[]
  selectedId: string | null
  onSelect: (format: ProductFormat) => void
  /** Short unit label (« bouteille », « kg »), for the unit price of a pack. */
  unitLabel: string
}

/**
 * The formats of a product side by side, each with its price — and, for a
 * pack, what one unit comes to, since that is what the buyer compares.
 */
export function FormatPicker({ formats, selectedId, onSelect, unitLabel }: FormatPickerProps) {
  const { semantic } = useTheme()
  const { formatMoney } = useMoney()
  const unitPrice = formats.find(format => format.id === null)?.price ?? null

  return (
    <View style={styles.container} accessibilityRole="radiogroup" accessibilityLabel="Format">
      <Text style={[styles.title, { color: semantic.textSecondary }]}>FORMAT</Text>
      <View style={styles.list}>
        {formats.map((format) => {
          const selected = format.id === selectedId
          const soldOut = format.stock <= 0
          const perUnit = format.packSize ? format.price / format.packSize : null
          const money = formatMoney(format.price)
          // The saving only says something when the pack beats the unit.
          const saving = perUnit !== null && unitPrice ? Math.round((1 - perUnit / unitPrice) * 100) : 0
          return (
            <Pressable
              key={format.id ?? 'unit'}
              onPress={() => onSelect(format)}
              disabled={soldOut}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: soldOut }}
              style={[
                styles.option,
                { borderColor: selected ? colors.green[400] : semantic.borderNormal, backgroundColor: selected ? semantic.bgPrimaryLight : semantic.bgCard },
                soldOut && styles.soldOut,
              ]}
            >
              <View style={styles.optionText}>
                <Text style={[styles.label, { color: semantic.textPrimary }]}>{format.label}</Text>
                {perUnit !== null
                  ? (
                      <Text style={[styles.meta, { color: semantic.textSecondary }]}>
                        {`soit ${formatMoney(perUnit).primary} / ${unitLabel}`}
                      </Text>
                    )
                  : null}
                {soldOut
                  ? <Text style={[styles.meta, { color: colors.coral[600] }]}>Épuisé</Text>
                  : null}
              </View>
              <View style={styles.priceColumn}>
                <Text style={[styles.price, { color: semantic.textPrimary }]}>{money.primary}</Text>
                {money.secondary
                  ? <Text style={[styles.meta, { color: semantic.textSecondary }]}>{money.secondary}</Text>
                  : null}
                {saving >= 1
                  ? (
                      <View style={[styles.saving, { backgroundColor: colors.earth[50] }]}>
                        <Text style={[styles.savingText, { color: colors.earth[800] }]}>{`−${saving} %`}</Text>
                      </View>
                    )
                  : null}
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing[4],
  },
  title: {
    ...typography.overline,
    marginBottom: spacing[2],
  },
  list: {
    gap: spacing[2],
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderWidth: 1.5,
    borderRadius: radius.md,
    gap: spacing[3],
  },
  soldOut: {
    opacity: 0.5,
  },
  optionText: {
    flex: 1,
  },
  label: {
    ...typography.bodyS,
    fontFamily: typography.h3.fontFamily,
  },
  meta: {
    ...typography.caption,
  },
  priceColumn: {
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  price: {
    ...typography.price,
  },
  saving: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
  },
  savingText: {
    ...typography.caption,
  },
})
