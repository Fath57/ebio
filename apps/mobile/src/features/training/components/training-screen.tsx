import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'

interface TrainingModule {
  id: string
  title: string
  theme: string
  format: 'VIDEO' | 'AUDIO' | 'ILLUSTRATED'
  durationSeconds: number
  thumbnailUrl: string
  downloadable: boolean
}

interface UserProgress {
  completedCount: number
  totalModules: number
  badges: { moduleId: string }[]
}

const FORMAT_ICONS: Record<string, string> = {
  VIDEO: 'V',
  AUDIO: 'A',
  ILLUSTRATED: 'I',
}

const FORMAT_LABELS: Record<string, string> = {
  VIDEO: 'Video',
  AUDIO: 'Audio',
  ILLUSTRATED: 'Illustre',
}

const THEMES = ['Tous', 'Agriculture', 'Transformation', 'Commerce', 'Certification']

export function TrainingScreen() {
  const { semantic } = useTheme()
  const [modules, setModules] = useState<TrainingModule[]>([])
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTheme, setSelectedTheme] = useState('Tous')

  const fetchModules = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedTheme !== 'Tous')
        params.set('theme', selectedTheme)

      const [modulesRes, progressRes] = await Promise.all([
        apiFetch(`/api/training/modules?${params.toString()}`),
        apiFetch('/api/training/my-progress'),
      ])

      if (modulesRes.ok) {
        const data = await modulesRes.json()
        setModules(data.modules ?? data)
      }
      if (progressRes.ok) {
        setProgress(await progressRes.json())
      }
    }
    catch {
      // Silent fallback
    }
    finally {
      setIsLoading(false)
    }
  }, [selectedTheme])

  useEffect(() => {
    fetchModules()
  }, [fetchModules])

  function formatDuration(seconds: number): string {
    const min = Math.floor(seconds / 60)
    if (min < 60)
      return `${min} min`
    const hours = Math.floor(min / 60)
    const remaining = min % 60
    return `${hours}h${remaining > 0 ? `${remaining}` : ''}`
  }

  function isCompleted(moduleId: string): boolean {
    return progress?.badges.some(b => b.moduleId === moduleId) ?? false
  }

  function renderModuleItem({ item }: { item: TrainingModule }): React.ReactElement {
    const completed = isCompleted(item.id)

    return (
      <TouchableOpacity
        style={[styles.moduleCard, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
        accessibilityLabel={`Module: ${item.title}`}
      >
        <View style={styles.moduleIconContainer}>
          <View
            style={[
              styles.formatBadge,
              completed && styles.formatBadgeCompleted,
            ]}
          >
            <Text
              style={[
                styles.formatBadgeText,
                completed && styles.formatBadgeTextCompleted,
              ]}
            >
              {FORMAT_ICONS[item.format] ?? '?'}
            </Text>
          </View>
        </View>

        <View style={styles.moduleContent}>
          <Text style={[styles.moduleTitle, { color: semantic.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.moduleMetaRow}>
            <Text style={[styles.moduleMeta, { color: semantic.textTertiary }]}>
              {FORMAT_LABELS[item.format]}
              {' '}
              -
              {formatDuration(item.durationSeconds)}
            </Text>
            <Text style={styles.moduleTheme}>{item.theme}</Text>
          </View>
        </View>

        {completed && (
          <View style={[styles.completedBadge, { backgroundColor: semantic.bgPrimaryLight }]}>
            <Text style={[styles.completedBadgeText, { color: semantic.textPrimaryColor }]}>Valide</Text>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <Text style={[styles.title, { color: semantic.textPrimary }]}>Formation</Text>

      {/* Progress bar */}
      {progress && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBarBg, { backgroundColor: semantic.borderLight }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${
                    progress.totalModules > 0
                      ? (progress.completedCount / progress.totalModules) * 100
                      : 0
                  }%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: semantic.textTertiary }]}>
            {progress.completedCount}
            /
            {progress.totalModules}
            {' '}
            modules completes
          </Text>
        </View>
      )}

      {/* Theme filters */}
      <FlatList
        data={THEMES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item}
        contentContainerStyle={styles.themeList}
        renderItem={({ item }) => {
          const isActive = selectedTheme === item
          return (
            <TouchableOpacity
              style={[styles.themeChip, { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }, isActive && styles.themeChipActive]}
              onPress={() => setSelectedTheme(item)}
              accessibilityLabel={`Filtrer par ${item}`}
            >
              <Text
                style={[
                  styles.themeChipText,
                  { color: semantic.textSecondary },
                  isActive && styles.themeChipTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )
        }}
      />

      {/* Module list */}
      {isLoading
        ? (
            <ActivityIndicator
              style={styles.loader}
              size="large"
              color={colors.green[400]}
            />
          )
        : (
            <FlatList
              data={modules}
              keyExtractor={item => item.id}
              renderItem={renderModuleItem}
              contentContainerStyle={styles.moduleList}
              ListEmptyComponent={(
                <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>
                  Aucun module de formation disponible
                </Text>
              )}
            />
          )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  title: {
    ...typography.h1,
    color: colors.neutral[800],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
    paddingBottom: spacing[2],
  },
  progressContainer: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[1],
  },
  progressBarBg: {
    height: 8,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.green[400],
    borderRadius: radius.pill,
  },
  progressText: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  themeList: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    paddingBottom: spacing[3],
  },
  themeChip: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.neutral[50],
  },
  themeChipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  themeChipText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
    color: colors.neutral[600],
  },
  themeChipTextActive: {
    color: colors.green[800],
  },
  loader: {
    marginTop: spacing[8],
  },
  moduleList: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[10],
  },
  moduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral[50],
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.neutral[200],
    gap: spacing[3],
    minHeight: 72,
  },
  moduleIconContainer: {
    width: 48,
    alignItems: 'center',
  },
  formatBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blue[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatBadgeCompleted: {
    backgroundColor: colors.green[50],
  },
  formatBadgeText: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
    color: colors.blue[600],
  },
  formatBadgeTextCompleted: {
    color: colors.green[600],
  },
  moduleContent: {
    flex: 1,
    gap: spacing[1],
  },
  moduleTitle: {
    ...typography.h3,
    color: colors.neutral[800],
  },
  moduleMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  moduleMeta: {
    ...typography.caption,
    color: colors.neutral[400],
  },
  moduleTheme: {
    ...typography.overline,
    color: colors.earth[600],
  },
  completedBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.sm,
    backgroundColor: colors.green[50],
  },
  completedBadgeText: {
    ...typography.caption,
    color: colors.green[600],
  },
  emptyText: {
    ...typography.bodyS,
    color: colors.neutral[400],
    textAlign: 'center',
    paddingVertical: spacing[8],
  },
})
