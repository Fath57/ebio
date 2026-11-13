import type { FamilyWalletOption } from '../family-wallet-api'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import HeartHandshake from 'lucide-react-native/dist/esm/icons/heart-handshake'
import * as React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { formatXof } from '../../common/hooks/use-money'
import { FAMILY_REFUSAL_MESSAGES } from '../family-wallet-api'

interface FamilyWalletPaymentOptionsProps {
  options: FamilyWalletOption[]
  /** Product names by id, to name the products a category limit refuses. */
  productNames: Map<string, string>
  selectedMemberId: string | null
  onSelect: (memberId: string | null) => void
}

/** Why an option cannot pay this basket, in plain French. */
function refusalText(option: FamilyWalletOption, productNames: Map<string, string>): string {
  switch (option.reason) {
    case 'MONTHLY_CAP':
      return `Il vous reste ${formatXof(option.spendable)} ce mois-ci`
    case 'CATEGORY': {
      const names = [...new Set(option.blockedProductIds.map(id => productNames.get(id)).filter((name): name is string => Boolean(name)))]
      return names.length > 0
        ? `Produits non autorisés : ${names.join(', ')}`
        : FAMILY_REFUSAL_MESSAGES.CATEGORY
    }
    case 'ORDER_MAX':
    case 'INSUFFICIENT':
    case 'INACTIVE':
      return FAMILY_REFUSAL_MESSAGES[option.reason]
    default:
      return 'Indisponible pour cette commande'
  }
}

/**
 * One payment option per family wallet the buyer belongs to: « Portefeuille
 * famille (Awa) — X FCFA disponibles », greyed with the reason when it cannot
 * pay the whole basket.
 */
export function FamilyWalletPaymentOptions({ options, productNames, selectedMemberId, onSelect }: FamilyWalletPaymentOptionsProps) {
  const { semantic } = useTheme()
  return (
    <>
      {options.map((option) => {
        const selected = option.usable && selectedMemberId === option.memberId
        const title = option.payerFirstName
          ? `Portefeuille famille (${option.payerFirstName})`
          : 'Portefeuille famille'
        const hint = option.usable
          ? `${formatXof(option.spendable)} disponibles — débit immédiat, sans frais`
          : refusalText(option, productNames)
        return (
          <TouchableOpacity
            key={option.memberId}
            style={[
              styles.option,
              { backgroundColor: selected ? semantic.bgPrimaryLight : semantic.bgCard },
              !option.usable && styles.disabled,
            ]}
            onPress={() => onSelect(selected ? null : option.memberId)}
            disabled={!option.usable}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: !option.usable }}
            accessibilityLabel={`${title}. ${option.usable ? `${formatXof(option.spendable)} disponibles` : `Indisponible : ${hint}`}`}
          >
            <HeartHandshake size={18} color={selected ? colors.green[600] : semantic.textSecondary} strokeWidth={2} />
            <View style={styles.text}>
              <Text style={[styles.title, { color: semantic.textPrimary }]}>{title}</Text>
              <Text style={[styles.hint, { color: semantic.textSecondary }]}>{hint}</Text>
            </View>
            {selected && <CircleCheck size={18} color={colors.green[600]} strokeWidth={2} />}
          </TouchableOpacity>
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    minHeight: 44,
  },
  text: { flex: 1 },
  title: { ...typography.h3 },
  hint: { ...typography.bodyS, marginTop: 2 },
  disabled: { opacity: 0.5 },
})
