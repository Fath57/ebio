import type { Relative } from '../relatives-api'
import * as React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useRelatives } from '../relatives-api'

interface SavedRelativesPickerProps {
  /** The relative the form was filled from, highlighted. */
  selectedId: string | null
  /** Fills the recipient form; every field stays editable for this order. */
  onPick: (relative: Relative) => void
}

/**
 * The address book at the top of « Livrer à un proche »: one tap fills the
 * form. Nothing shows for a payer who has saved no one yet.
 */
export function SavedRelativesPicker({ selectedId, onPick }: SavedRelativesPickerProps) {
  const { semantic } = useTheme()
  const { relatives } = useRelatives()

  if (relatives.length === 0)
    return null

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: semantic.textSecondary }]}>Mes proches</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="radiogroup"
      >
        {relatives.map((relative) => {
          const selected = relative.id === selectedId
          return (
            <TouchableOpacity
              key={relative.id}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? semantic.bgPrimaryLight : semantic.bgSurface,
                  borderColor: selected ? colors.green[400] : semantic.borderNormal,
                },
              ]}
              onPress={() => onPick(relative)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${relative.nickname}, ${relative.name}`}
            >
              <Text style={[styles.nickname, { color: semantic.textPrimary }]} numberOfLines={1}>{relative.nickname}</Text>
              <Text style={[styles.name, { color: semantic.textSecondary }]} numberOfLines={1}>{relative.name}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  label: {
    ...typography.caption,
  },
  row: {
    gap: spacing[2],
  },
  chip: {
    minHeight: 44,
    maxWidth: 180,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    justifyContent: 'center',
  },
  nickname: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  name: {
    ...typography.caption,
  },
})
