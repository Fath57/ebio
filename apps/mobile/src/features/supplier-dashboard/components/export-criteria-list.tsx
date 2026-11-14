import type { ExportCriterion } from '../utils/terroir-export'
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right'
import Circle from 'lucide-react-native/dist/esm/icons/circle'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { missingLabel } from '../utils/terroir-export'

interface ExportCriteriaListProps {
  criteria: ExportCriterion[]
  /** Wording of the goal once every criterion is met. */
  doneText: string
  /** Tapping an unmet criterion; the rows are plain text without it. */
  onPressCriterion?: (criterion: ExportCriterion) => void
}

interface CriterionRowProps {
  criterion: ExportCriterion
  first: boolean
  onPress?: (criterion: ExportCriterion) => void
}

function CriterionRow({ criterion, first, onPress }: CriterionRowProps) {
  const { semantic } = useTheme()
  const content = (
    <>
      {criterion.met
        ? <CircleCheck size={20} color={colors.green[600]} strokeWidth={2.25} />
        : <Circle size={20} color={semantic.textTertiary} strokeWidth={2} />}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: criterion.met ? semantic.textSecondary : semantic.textPrimary }]}>
          {criterion.label}
        </Text>
        {!criterion.met && criterion.hint
          ? <Text style={[styles.rowHint, { color: semantic.textSecondary }]}>{criterion.hint}</Text>
          : null}
      </View>
      {!criterion.met && onPress ? <ChevronRight size={18} color={semantic.textTertiary} /> : null}
    </>
  )
  const rowStyle = [styles.row, !first && { borderTopWidth: 1, borderTopColor: semantic.borderLight }]
  if (criterion.met || !onPress) {
    return (
      <View style={rowStyle} accessibilityLabel={`${criterion.label} : ${criterion.met ? 'rempli' : 'à compléter'}`}>
        {content}
      </View>
    )
  }
  return (
    <TouchableOpacity
      style={rowStyle}
      onPress={() => onPress(criterion)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${criterion.label} : à compléter`}
      accessibilityHint={criterion.hint}
    >
      {content}
    </TouchableOpacity>
  )
}

/**
 * The export criteria of a product or a pack, met or not, with a one-line
 * summary of what is missing. Unmet rows say how to fix them.
 */
export function ExportCriteriaList({ criteria, doneText, onPressCriterion }: ExportCriteriaListProps) {
  const { semantic } = useTheme()
  const missing = criteria.filter(c => !c.met).length
  const done = missing === 0 && criteria.length > 0
  return (
    <View style={[styles.card, { backgroundColor: semantic.bgCard }]}>
      <View style={[styles.summary, { backgroundColor: done ? colors.green[50] : semantic.bgPage }]}>
        <Text
          style={[styles.summaryText, { color: done ? colors.green[800] : semantic.textPrimary }]}
          accessibilityLiveRegion="polite"
        >
          {done ? doneText : `Il vous manque ${missingLabel(missing)}`}
        </Text>
        <Text style={[styles.summaryCount, { color: done ? colors.green[800] : semantic.textSecondary }]}>
          {`${criteria.length - missing} / ${criteria.length}`}
        </Text>
      </View>
      {criteria.map((criterion, index) => (
        <CriterionRow key={criterion.key} criterion={criterion} first={index === 0} onPress={onPressCriterion} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, paddingHorizontal: spacing[3], paddingBottom: spacing[1], paddingTop: spacing[3] },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginBottom: spacing[1],
  },
  summaryText: { ...typography.bodyL, fontFamily: fonts.sansSb, flex: 1 },
  summaryCount: { ...typography.caption, fontFamily: fonts.mono },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], minHeight: 44, paddingVertical: spacing[3] },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { ...typography.bodyS, fontFamily: fonts.sansSb },
  rowHint: { ...typography.caption },
})
