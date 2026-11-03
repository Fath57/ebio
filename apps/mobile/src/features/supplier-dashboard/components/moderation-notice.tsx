import type { LucideIcon } from 'lucide-react-native'
import type { ModerationStatus } from '../utils/product-moderation'
import XCircle from 'lucide-react-native/dist/esm/icons/circle-x'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off'
import * as React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'

interface NoticeCopy {
  title: string
  body: string
  icon: LucideIcon
  family: 'earth' | 'coral' | 'neutral'
}

function noticeCopy(status: Exclude<ModerationStatus, 'APPROVED'>): NoticeCopy {
  switch (status) {
    case 'PENDING':
      return {
        title: 'En attente de validation',
        body: 'Ce produit attend la validation d\'eBio. Il n\'est pas encore visible des acheteurs.',
        icon: Clock,
        family: 'earth',
      }
    case 'REJECTED':
      return {
        title: 'Refusé par eBio',
        body: 'Corrigez-le puis enregistrez pour le soumettre à nouveau.',
        icon: XCircle,
        family: 'coral',
      }
    case 'WITHDRAWN':
      return {
        title: 'Retiré des apps par eBio',
        body: 'Contactez le support pour le remettre en ligne.',
        icon: EyeOff,
        family: 'neutral',
      }
  }
}

interface ModerationNoticeProps {
  status: ModerationStatus
  reason: string | null
}

/** Explains to the shop why a product is not (or no longer) visible to buyers. */
export function ModerationNotice({ status, reason }: ModerationNoticeProps): React.ReactElement | null {
  const { isDark } = useTheme()
  if (status === 'APPROVED')
    return null

  const copy = noticeCopy(status)
  const palette = colors[copy.family]
  // Badge backgrounds invert in dark mode (50 → 900), text moves to the light stops.
  const background = isDark ? palette[900] : palette[50]
  const border = isDark ? palette[800] : palette[100]
  const titleColor = isDark ? palette[100] : palette[800]
  const bodyColor = isDark ? palette[200] : palette[600]
  const Icon = copy.icon
  const showReason = reason != null && status !== 'PENDING'

  return (
    <View
      style={[styles.notice, { backgroundColor: background, borderColor: border }]}
      accessibilityRole="summary"
    >
      <Icon size={20} color={titleColor} strokeWidth={2} />
      <View style={styles.texts}>
        <Text style={[styles.title, { color: titleColor }]}>{copy.title}</Text>
        {showReason && (
          <Text style={[styles.body, { color: bodyColor }]}>
            <Text style={styles.reasonLabel}>Motif : </Text>
            {reason}
          </Text>
        )}
        <Text style={[styles.body, { color: bodyColor }]}>{copy.body}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  texts: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    ...typography.bodyS,
    fontFamily: fonts.sansSb,
  },
  body: {
    ...typography.bodyS,
  },
  reasonLabel: {
    fontFamily: fonts.sansSb,
  },
})
