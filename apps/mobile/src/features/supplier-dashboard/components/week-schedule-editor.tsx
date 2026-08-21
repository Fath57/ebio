import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

export const WEEK_DAYS: Array<{ key: string, label: string }> = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
  { key: 'sunday', label: 'Dimanche' },
]

const HOURS: string[] = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES: string[] = ['00', '15', '30', '45']

/** Slot as the API stores it: { open: 'HH:MM', close: 'HH:MM', closed?: true }. */
export interface ApiDayHours {
  open?: string
  close?: string
  closed?: boolean
}

export type ApiWeekHours = Record<string, ApiDayHours>

/**
 * Controlled weekly-hours editor, shared wherever a schedule is edited. The
 * value travels in the API shape directly, so callers never juggle two models.
 * Days absent from the value are closed — a market stall only lists its days.
 */
export function WeekScheduleEditor({ value, onChange }: {
  value: ApiWeekHours
  onChange: (next: ApiWeekHours) => void
}) {
  const { semantic } = useTheme()

  function dayState(dayKey: string): { isOpen: boolean, open: string, close: string } {
    const day = value[dayKey]
    if (!day || day.closed === true || !day.open || !day.close) {
      return { isOpen: false, open: '08:00', close: '18:00' }
    }
    return { isOpen: true, open: day.open, close: day.close }
  }

  function toggleDay(dayKey: string): void {
    const state = dayState(dayKey)
    onChange({
      ...value,
      [dayKey]: state.isOpen
        ? { closed: true }
        : { open: state.open, close: state.close },
    })
  }

  function setTime(dayKey: string, field: 'open' | 'close', part: 'hour' | 'minute', piece: string): void {
    const state = dayState(dayKey)
    const [hour, minute] = state[field].split(':')
    const next = part === 'hour' ? `${piece}:${minute}` : `${hour}:${piece}`
    onChange({ ...value, [dayKey]: { open: state.open, close: state.close, [field]: next } })
  }

  function renderTimeRow(dayKey: string, field: 'open' | 'close', label: string): React.ReactNode {
    const state = dayState(dayKey)
    const [selectedHour, selectedMinute] = state[field].split(':')

    return (
      <View style={styles.timeRow}>
        <Text style={[styles.timeLabel, { color: semantic.textSecondary }]}>{label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScroll}>
          {HOURS.map(hour => (
            <TouchableOpacity
              key={`${dayKey}-${field}-h${hour}`}
              style={[
                styles.timeChip,
                { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal },
                selectedHour === hour && styles.timeChipActive,
              ]}
              onPress={() => setTime(dayKey, field, 'hour', hour)}
              accessibilityLabel={`${hour} heures`}
            >
              <Text style={[styles.timeChipText, { color: semantic.textSecondary }, selectedHour === hour && styles.timeChipTextActive]}>
                {hour}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={[styles.timeSeparator, { color: semantic.textTertiary }]}>:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScroll}>
          {MINUTES.map(minute => (
            <TouchableOpacity
              key={`${dayKey}-${field}-m${minute}`}
              style={[
                styles.timeChip,
                { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal },
                selectedMinute === minute && styles.timeChipActive,
              ]}
              onPress={() => setTime(dayKey, field, 'minute', minute)}
              accessibilityLabel={`${minute} minutes`}
            >
              <Text style={[styles.timeChipText, { color: semantic.textSecondary }, selectedMinute === minute && styles.timeChipTextActive]}>
                {minute}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    )
  }

  return (
    <View>
      {WEEK_DAYS.map((day) => {
        const state = dayState(day.key)
        return (
          <View key={day.key} style={[styles.dayCard, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}>
            <View style={styles.dayHeader}>
              <View>
                <Text style={[styles.dayLabel, { color: semantic.textPrimary }]}>{day.label}</Text>
                <Text style={[styles.daySummary, { color: semantic.textTertiary }]}>
                  {state.isOpen ? `${state.open} – ${state.close}` : 'Fermé'}
                </Text>
              </View>
              <Switch
                value={state.isOpen}
                onValueChange={() => toggleDay(day.key)}
                trackColor={{ false: colors.neutral[200], true: colors.green[200] }}
                thumbColor={state.isOpen ? colors.green[600] : colors.neutral[400]}
              />
            </View>
            {state.isOpen && (
              <View style={[styles.dayTimes, { borderTopColor: semantic.borderLight }]}>
                {renderTimeRow(day.key, 'open', 'Ouvre')}
                {renderTimeRow(day.key, 'close', 'Ferme')}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  dayCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing[3],
    paddingHorizontal: spacing[4],
  },
  dayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  dayLabel: { fontFamily: fonts.sansSb, fontSize: 15 },
  daySummary: { fontFamily: fonts.mono, fontSize: 12, marginTop: 2 },
  dayTimes: { borderTopWidth: 1, paddingVertical: spacing[3] },
  timeChip: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  timeChipActive: { backgroundColor: colors.green[50], borderColor: colors.green[400] },
  timeChipText: { fontFamily: fonts.mono, fontSize: 13 },
  timeChipTextActive: { color: colors.green[800] },
  timeLabel: { fontFamily: fonts.sansMd, fontSize: 13, width: 52 },
  timeRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[1], marginBottom: spacing[2] },
  timeScroll: { gap: spacing[1] },
  timeSeparator: { fontFamily: fonts.mono, fontSize: 16 },
})
