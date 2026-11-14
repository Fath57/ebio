import type { ExportPackStatus } from '../utils/terroir-export'
import Archive from 'lucide-react-native/dist/esm/icons/archive'
import BadgeCheck from 'lucide-react-native/dist/esm/icons/badge-check'
import CircleDashed from 'lucide-react-native/dist/esm/icons/circle-dashed'
import CircleX from 'lucide-react-native/dist/esm/icons/circle-x'
import { StyleSheet, Text, View } from 'react-native'
import { fonts, radius, spacing, typography } from '../../../theme/theme'
import { describeExportStatus } from '../utils/terroir-export'

const ICONS = {
  exportable: BadgeCheck,
  incomplete: CircleDashed,
  withdrawn: CircleX,
  retired: Archive,
} as const

interface ExportStatusBadgeProps {
  status: ExportPackStatus
}

/** Where a product or a pack stands for export, as an icon and a word: the colour only repeats it. */
export function ExportStatusBadge({ status }: ExportStatusBadgeProps) {
  const display = describeExportStatus(status)
  const Icon = ICONS[display.kind]
  return (
    <View
      style={[styles.badge, { backgroundColor: display.background }]}
      accessibilityLabel={`Statut : ${display.label}`}
    >
      <Icon size={14} color={display.color} strokeWidth={2.25} />
      <Text style={[styles.text, { color: display.color }]}>{display.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing[1],
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  text: { ...typography.caption, fontFamily: fonts.sansSb },
})
