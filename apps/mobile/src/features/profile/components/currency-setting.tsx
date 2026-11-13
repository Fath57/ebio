import type { DisplayCurrency } from '../../common/currency-context'
import * as React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useCurrency } from '../../common/currency-context'

const CURRENCY_OPTIONS: Array<{ value: DisplayCurrency, label: string }> = [
  { value: 'XOF', label: 'FCFA' },
  { value: 'EUR', label: 'Euro' },
  { value: 'USD', label: 'Dollar US' },
  { value: 'CAD', label: 'Dollar canadien' },
]

/**
 * « Devise d'affichage » : the currency prices are shown in, FCFA beside
 * them. A currency without a rate from the server is not offered — it could
 * not be shown anyway.
 */
export function CurrencySetting() {
  const { semantic } = useTheme()
  const { currency, setCurrency, rates } = useCurrency()
  const options = CURRENCY_OPTIONS.filter(option => option.value === 'XOF' || rates[option.value])

  // FCFA alone is no choice at all.
  if (options.length < 2)
    return null

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: semantic.textTertiary }]}>
        DEVISE D'AFFICHAGE
      </Text>
      <View style={[styles.selector, { backgroundColor: semantic.bgCard }]} accessibilityRole="radiogroup" accessibilityLabel="Devise d'affichage">
        {options.map((option) => {
          const isActive = currency === option.value
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.option, isActive && { backgroundColor: semantic.bgPrimaryLight }]}
              onPress={() => setCurrency(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: isActive ? semantic.textPrimaryColor : semantic.textSecondary },
                  isActive && styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {currency !== 'XOF' && (
        <Text style={[styles.hint, { color: semantic.textTertiary }]}>
          Les prix restent payés en FCFA : le montant en devise est indicatif.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing[5],
  },
  sectionTitle: {
    ...typography.overline,
    paddingHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
  selector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
    gap: spacing[1],
  },
  option: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    borderRadius: radius.md,
  },
  optionText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  optionTextActive: {
    fontFamily: fonts.sansSb,
  },
  hint: {
    ...typography.caption,
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
  },
})
