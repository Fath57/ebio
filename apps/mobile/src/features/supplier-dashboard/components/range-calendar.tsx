import ChevronLeft from 'lucide-react-native/dist/esm/icons/chevron-left'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { fromDayString, toDayString } from '../utils/statement-period'

const WEEKDAYS = [
  { key: 'lun', label: 'L' },
  { key: 'mar', label: 'M' },
  { key: 'mer', label: 'M' },
  { key: 'jeu', label: 'J' },
  { key: 'ven', label: 'V' },
  { key: 'sam', label: 'S' },
  { key: 'dim', label: 'D' },
]
const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

interface RangeCalendarProps {
  /** `to` is null while only the first day is picked. */
  value: { from: string | null, to: string | null }
  onChange: (value: { from: string | null, to: string | null }) => void
}

/** The month's days, with leading blanks so the 1st falls under its weekday. */
function monthCells(year: number, month: number): Array<{ key: string, day: string | null }> {
  const leading = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: leading }, (_, slot) => ({ key: `blank-${slot}`, day: null as string | null }))
  for (let date = 1; date <= daysInMonth; date++) {
    const day = toDayString(new Date(year, month, date))
    cells.push({ key: day, day })
  }
  return cells
}

/**
 * Two taps pick a span: the first day, then the last. A third tap starts
 * over. Days after today are off — nothing was sold there yet.
 */
export function RangeCalendar({ value, onChange }: RangeCalendarProps) {
  const { semantic } = useTheme()
  const today = toDayString(new Date())
  const [visible, setVisible] = useState(() => {
    const anchor = value.from ? fromDayString(value.from) : new Date()
    return { year: anchor.getFullYear(), month: anchor.getMonth() }
  })
  const cells = useMemo(() => monthCells(visible.year, visible.month), [visible])
  const isCurrentMonth = toDayString(new Date(visible.year, visible.month, 1)).slice(0, 7) === today.slice(0, 7)

  const shiftMonth = (delta: number) => {
    setVisible((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const pick = (day: string) => {
    if (!value.from || value.to) {
      onChange({ from: day, to: null })
      return
    }
    onChange(day < value.from ? { from: day, to: value.from } : { from: value.from, to: day })
  }

  return (
    <View style={[styles.container, { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => shiftMonth(-1)}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel="Mois précédent"
        >
          <ChevronLeft size={20} color={semantic.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.monthTitle, { color: semantic.textPrimary }]}>
          {MONTH_TITLE.format(new Date(visible.year, visible.month, 1))}
        </Text>
        <TouchableOpacity
          onPress={() => shiftMonth(1)}
          disabled={isCurrentMonth}
          style={[styles.navButton, isCurrentMonth && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Mois suivant"
          accessibilityState={{ disabled: isCurrentMonth }}
        >
          <ChevronRight size={20} color={semantic.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map(weekday => (
          <Text key={weekday.key} style={[styles.weekday, { color: semantic.textTertiary }]}>{weekday.label}</Text>
        ))}
        {cells.map(({ key, day }) => {
          if (!day)
            return <View key={key} style={styles.cell} />
          const isFuture = day > today
          const isEdge = day === value.from || day === value.to
          const isInside = !!value.from && !!value.to && day > value.from && day < value.to
          return (
            <TouchableOpacity
              key={day}
              onPress={() => pick(day)}
              disabled={isFuture}
              style={styles.cell}
              accessibilityRole="button"
              accessibilityLabel={DAY_LABEL.format(fromDayString(day))}
              accessibilityState={{ selected: isEdge || isInside, disabled: isFuture }}
            >
              <View style={[
                styles.dayBubble,
                isInside && { backgroundColor: colors.green[50] },
                isEdge && { backgroundColor: colors.green[400] },
              ]}
              >
                <Text style={[
                  styles.dayText,
                  { color: isFuture ? semantic.textTertiary : semantic.textPrimary },
                  isEdge && styles.dayTextEdge,
                  day === today && !isEdge && styles.dayTextToday,
                ]}
                >
                  {Number(day.slice(8))}
                </Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[3],
  },
  dayBubble: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  dayText: {
    fontFamily: fonts.sansMd,
    fontSize: 14,
  },
  dayTextEdge: {
    color: colors.neutral[0],
    fontFamily: fonts.sansSb,
  },
  dayTextToday: {
    color: colors.green[600],
    fontFamily: fonts.sansBd,
  },
  disabled: {
    opacity: 0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  monthTitle: {
    ...typography.h3,
    textTransform: 'capitalize',
  },
  navButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  weekday: {
    ...typography.caption,
    textAlign: 'center',
    width: `${100 / 7}%`,
  },
})
