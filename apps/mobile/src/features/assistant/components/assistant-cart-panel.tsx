import type { AssistantCartLine } from '../assistant'
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down'
import ChevronUp from 'lucide-react-native/dist/esm/icons/chevron-up'
import Minus from 'lucide-react-native/dist/esm/icons/minus'
import Plus from 'lucide-react-native/dist/esm/icons/plus'
import Trash2 from 'lucide-react-native/dist/esm/icons/trash-2'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { cartTotal } from '../assistant'

interface AssistantCartPanelProps {
  cart: AssistantCartLine[]
  /** Open by default once something is in it, so the total is never hunted for. */
  expanded: boolean
  onToggle: () => void
  onChangeQuantity: (productId: string, quantity: number) => void
  onOrder: () => void
  /** True while a hand correction is in flight: the steppers wait for the server. */
  busy: boolean
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} FCFA`
}

/**
 * Le panier de la conversation, toujours au même endroit.
 *
 * Il tient le bas de l'écran parce que c'est ce qu'on vérifie : la charte veut
 * le total visible sans avoir à le chercher, et une conversation vocale n'offre
 * aucune autre preuve de ce qui a été compris.
 */
export function AssistantCartPanel({
  cart,
  expanded,
  onToggle,
  onChangeQuantity,
  onOrder,
  busy,
}: AssistantCartPanelProps) {
  const { semantic } = useTheme()
  const total = cartTotal(cart)
  const count = cart.reduce((sum, line) => sum + line.quantity, 0)

  if (cart.length === 0) {
    return null
  }

  return (
    <View style={[styles.panel, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderLight }]}>
      <Pressable
        style={styles.summary}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Panier, ${count} article${count > 1 ? 's' : ''}, ${money(total)}. ${expanded ? 'Réduire' : 'Voir le détail'}`}
      >
        <View style={styles.summaryText}>
          <Text style={[styles.count, { color: semantic.textSecondary }]}>
            {count}
            {' '}
            article
            {count > 1 ? 's' : ''}
          </Text>
          <Text style={[styles.total, { color: semantic.textPrimary }]}>{money(total)}</Text>
        </View>
        {expanded
          ? <ChevronDown size={20} color={semantic.textSecondary} strokeWidth={2.2} />
          : <ChevronUp size={20} color={semantic.textSecondary} strokeWidth={2.2} />}
      </Pressable>

      {expanded && (
        <ScrollView style={styles.lines} keyboardShouldPersistTaps="handled">
          {cart.map(line => (
            <View key={line.productId} style={[styles.line, { borderTopColor: semantic.borderLight }]}>
              <View style={styles.lineText}>
                <Text style={[styles.lineName, { color: semantic.textPrimary }]} numberOfLines={1}>
                  {line.name}
                </Text>
                <Text style={[styles.lineShop, { color: semantic.textTertiary }]} numberOfLines={1}>
                  {line.supplierName}
                  {' · '}
                  {money(line.pricePerUnit)}
                </Text>
              </View>

              <View style={styles.stepper}>
                <Pressable
                  style={[styles.stepButton, { borderColor: semantic.borderNormal }]}
                  disabled={busy}
                  onPress={() => onChangeQuantity(line.productId, line.quantity - 1)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={line.quantity === 1
                    ? `Retirer ${line.name}`
                    : `Enlever un, ${line.name}`}
                >
                  {line.quantity === 1
                    ? <Trash2 size={16} color={colors.coral[400]} strokeWidth={2.2} />
                    : <Minus size={16} color={semantic.textPrimary} strokeWidth={2.4} />}
                </Pressable>

                <Text style={[styles.quantity, { color: semantic.textPrimary }]}>{line.quantity}</Text>

                <Pressable
                  style={[styles.stepButton, { borderColor: semantic.borderNormal }]}
                  disabled={busy}
                  onPress={() => onChangeQuantity(line.productId, line.quantity + 1)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter un, ${line.name}`}
                >
                  <Plus size={16} color={semantic.textPrimary} strokeWidth={2.4} />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable
        style={styles.order}
        onPress={onOrder}
        accessibilityRole="button"
        accessibilityLabel={`Commander, ${money(total)}`}
      >
        <Text style={styles.orderText}>Commander</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[3],
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  summaryText: {
    gap: spacing[1],
  },
  count: {
    ...typography.caption,
  },
  total: {
    ...typography.price,
    fontSize: 20,
  },
  // Bounded so the conversation never disappears behind a long cart.
  lines: {
    maxHeight: 220,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lineText: {
    flex: 1,
    gap: 2,
  },
  lineName: {
    ...typography.bodyS,
    fontFamily: fonts.sansMd,
  },
  lineShop: {
    ...typography.caption,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: {
    ...typography.price,
    minWidth: 24,
    textAlign: 'center',
  },
  order: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[0],
  },
})
