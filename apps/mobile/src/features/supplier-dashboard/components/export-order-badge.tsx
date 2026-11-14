import Plane from 'lucide-react-native/dist/esm/icons/plane'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { formatCollectBefore } from '../utils/terroir-export'

/** « Commande export » as an icon and a word: the colour only repeats it. */
export function ExportOrderBadge() {
  return (
    <View style={styles.badge} accessibilityLabel="Commande export">
      <Plane size={14} color={colors.earth[800]} strokeWidth={2.25} />
      <Text style={styles.badgeText}>Commande export</Text>
    </View>
  )
}

interface ExportCollectNoticeProps {
  collectBefore: string | null
}

/** When eBio comes to collect an export order from the shop. */
export function ExportCollectNotice({ collectBefore }: ExportCollectNoticeProps) {
  const when = collectBefore ? formatCollectBefore(collectBefore) : ''
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>
        {when ? `À remettre à eBio avant le ${when}` : 'À remettre à eBio lors de la collecte'}
      </Text>
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
    backgroundColor: colors.earth[50],
  },
  badgeText: { ...typography.caption, fontFamily: fonts.sansSb, color: colors.earth[800] },
  notice: {
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.earth[50],
  },
  noticeText: { ...typography.bodyS, fontFamily: fonts.sansMd, color: colors.earth[800] },
})
