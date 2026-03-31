import * as React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius } from '../../../theme/theme'

type ViewMode = 'list' | 'map'

interface ViewToggleProps {
  activeMode: ViewMode
  onToggle: (mode: ViewMode) => void
}

export function ViewToggle({ activeMode, onToggle }: ViewToggleProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, activeMode === 'list' && styles.activeButton]}
        onPress={() => onToggle('list')}
        accessibilityRole="button"
        accessibilityState={{ selected: activeMode === 'list' }}
        accessibilityLabel="Affichage en liste"
      >
        <Text
          style={[styles.label, activeMode === 'list' && styles.activeLabel]}
        >
          Liste
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, activeMode === 'map' && styles.activeButton]}
        onPress={() => onToggle('map')}
        accessibilityRole="button"
        accessibilityState={{ selected: activeMode === 'map' }}
        accessibilityLabel="Affichage en carte"
      >
        <Text
          style={[styles.label, activeMode === 'map' && styles.activeLabel]}
        >
          Carte
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.neutral[100],
    borderRadius: radius.pill,
    padding: 2,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: colors.green[400],
  },
  label: {
    fontFamily: fonts.sansSb,
    fontSize: 13,
    color: colors.neutral[600],
  },
  activeLabel: {
    color: colors.neutral[0],
  },
})
