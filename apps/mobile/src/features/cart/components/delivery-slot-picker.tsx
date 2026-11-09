import type { SlotChoice, SlotDay } from '../utils/delivery-slot'
import * as React from 'react'
import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { ASAP_CHOICE, availableStartHours } from '../utils/delivery-slot'

interface DeliverySlotPickerProps {
  value: SlotChoice
  onChange: (choice: SlotChoice) => void
  now: Date
}

interface ChipProps {
  label: string
  isSelected: boolean
  isDisabled?: boolean
  onPress: () => void
}

function Chip({ label, isSelected, isDisabled = false, onPress }: ChipProps) {
  const { semantic } = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: isSelected ? colors.green[50] : semantic.bgSurface,
          borderColor: isSelected ? colors.green[400] : semantic.borderNormal,
          opacity: isDisabled ? 0.4 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: isSelected ? colors.green[600] : semantic.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
  )
}

/**
 * The slot used to be free text, which the courier search could not read: an
 * order wanted for 14 h was offered at 9 h and taken back from the courier
 * twice. A choice among real ranges gives the server a time it can follow.
 */
export function DeliverySlotPicker({ value, onChange, now }: DeliverySlotPickerProps) {
  const { semantic } = useTheme()
  const todayHours = useMemo(() => availableStartHours(0, now), [now])
  const selectedDay: SlotDay | null = value.kind === 'window' ? value.day : null
  const hours = selectedDay === null ? [] : availableStartHours(selectedDay, now)

  const handleSelectDay = (day: SlotDay) => {
    const firstHour = availableStartHours(day, now)[0]
    if (firstHour === undefined) {
      return
    }
    onChange({ kind: 'window', day, startHour: firstHour })
  }

  return (
    <View style={styles.container} accessibilityRole="radiogroup">
      <View style={styles.row}>
        <Chip label="Dès que possible" isSelected={value.kind === 'asap'} onPress={() => onChange(ASAP_CHOICE)} />
        <Chip
          label="Aujourd'hui"
          isSelected={selectedDay === 0}
          isDisabled={todayHours.length === 0}
          onPress={() => handleSelectDay(0)}
        />
        <Chip label="Demain" isSelected={selectedDay === 1} onPress={() => handleSelectDay(1)} />
      </View>

      {selectedDay !== null && (
        <View style={styles.row}>
          {hours.map(hour => (
            <Chip
              key={hour}
              label={`${hour}h – ${hour + 2}h`}
              isSelected={value.kind === 'window' && value.startHour === hour}
              onPress={() => onChange({ kind: 'window', day: selectedDay, startHour: hour })}
            />
          ))}
        </View>
      )}

      <Text style={[styles.hint, { color: semantic.textTertiary }]}>
        {value.kind === 'asap'
          ? 'Un livreur part dès que la boutique a préparé votre commande.'
          : 'Votre commande vous sera livrée dans ce créneau (heure du Bénin).'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
  },
  chipText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  hint: {
    ...typography.caption,
  },
})
