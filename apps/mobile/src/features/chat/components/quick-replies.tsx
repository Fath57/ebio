import * as React from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'

interface QuickRepliesProps {
  onSend: (message: string) => void
  replies?: string[]
}

const DEFAULT_REPLIES = [
  'Oui, disponible',
  'Rupture de stock',
  'Venez me voir',
]

export function QuickReplies({ onSend, replies = DEFAULT_REPLIES }: QuickRepliesProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {replies.map(reply => (
        <TouchableOpacity
          key={reply}
          style={styles.chip}
          onPress={() => onSend(reply)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Répondre : ${reply}`}
        >
          <Text style={styles.chipText}>{reply}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.green[200],
    backgroundColor: colors.green[50],
  },
  chipText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.green[800],
  },
})
