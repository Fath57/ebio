import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check'
import Lock from 'lucide-react-native/dist/esm/icons/lock'
import TriangleAlert from 'lucide-react-native/dist/esm/icons/triangle-alert'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { ConfirmModal } from '../../common/components/confirm-modal'
import { ScreenHeader } from '../../common/components/screen-header'

const DAYS_OF_WEEK: Array<{ key: string, label: string }> = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
  { key: 'sunday', label: 'Dimanche' },
]

const HOURS: string[] = Array.from({ length: 24 }, (_, h) =>
  String(h).padStart(2, '0'))
const MINUTES: string[] = ['00', '15', '30', '45']

interface DaySchedule {
  isOpen: boolean
  openHour: string
  openMinute: string
  closeHour: string
  closeMinute: string
}

type WeekSchedule = Record<string, DaySchedule>

/** Créneau tel que l'API le stocke et le renvoie. */
interface ApiDayHours {
  open?: string
  close?: string
  closed?: boolean
}

function createDefaultSchedule(): WeekSchedule {
  const schedule: WeekSchedule = {}
  for (const day of DAYS_OF_WEEK) {
    schedule[day.key] = {
      isOpen: day.key !== 'sunday',
      openHour: '08',
      openMinute: '00',
      closeHour: '18',
      closeMinute: '00',
    }
  }
  return schedule
}

interface OpeningHoursEditorProps {
  onSave?: () => void
  onGoBack?: () => void
}

export function OpeningHoursEditor({ onSave, onGoBack }: OpeningHoursEditorProps) {
  const { semantic } = useTheme()
  const tabBarHeight = useBottomTabBarHeight()
  const [schedule, setSchedule] = useState<WeekSchedule>(createDefaultSchedule)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [modal, setModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'confirm', onConfirm?: () => void }>({ visible: false, title: '', message: '', type: 'error' })

  function showError(title: string, message: string): void {
    setModal({ visible: true, title, message, type: 'error' })
  }

  function showSuccess(title: string, message: string, onDismiss?: () => void): void {
    setModal({ visible: true, title, message, type: 'success', onConfirm: onDismiss })
  }

  const fetchSchedule = useCallback(async (): Promise<void> => {
    try {
      const res = await apiFetch('/api/suppliers/me/settings')
      if (res.ok) {
        const settings = await res.json()
        // Format API : { monday: { open: 'HH:MM', close: 'HH:MM', closed?: true } }.
        // On parcourt la semaine canonique — un jour absent vaut « fermé ».
        const raw = (settings.openingHours ?? {}) as Record<string, ApiDayHours | null>
        const mapped: WeekSchedule = createDefaultSchedule()
        for (const day of DAYS_OF_WEEK) {
          const value = raw[day.key]
          if (!value || value.closed) {
            mapped[day.key] = { ...mapped[day.key], isOpen: false }
            continue
          }
          const [oh = '08', om = '00'] = (value.open ?? '08:00').split(':')
          const [ch = '18', cm = '00'] = (value.close ?? '18:00').split(':')
          mapped[day.key] = { isOpen: true, openHour: oh, openMinute: om, closeHour: ch, closeMinute: cm }
        }
        setSchedule(mapped)
      }
    }
    catch {
      // Use defaults
    }
    finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSchedule()
  }, [fetchSchedule])

  function handleToggleDay(dayKey: string): void {
    setSchedule(prev => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], isOpen: !prev[dayKey].isOpen },
    }))
  }

  function handleUpdateTime(
    dayKey: string,
    field: 'openHour' | 'openMinute' | 'closeHour' | 'closeMinute',
    value: string,
  ): void {
    setSchedule(prev => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: value },
    }))
  }

  function handleCloseToday(): void {
    const todayIndex = new Date().getDay()
    // JS getDay(): 0=Sunday, 1=Monday...
    const dayKeys = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ]
    const todayKey = dayKeys[todayIndex]
    if (todayKey) {
      setSchedule(prev => ({
        ...prev,
        [todayKey]: { ...prev[todayKey], isOpen: false },
      }))
    }
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true)
    try {
      // Un jour fermé garde ses horaires et porte `closed: true` : le contrat
      // n'accepte pas `null`, et l'utilisateur retrouve ses créneaux en rouvrant.
      const apiFormat: Record<string, ApiDayHours> = {}
      for (const [dayKey, day] of Object.entries(schedule)) {
        apiFormat[dayKey] = {
          open: `${day.openHour}:${day.openMinute}`,
          close: `${day.closeHour}:${day.closeMinute}`,
          ...(day.isOpen ? {} : { closed: true }),
        }
      }
      const res = await apiFetch('/api/suppliers/me/settings/opening-hours', {
        method: 'PATCH',
        body: JSON.stringify({ openingHours: apiFormat }),
      })
      if (res.ok) {
        showSuccess('Enregistré', 'Vos horaires ont été mis à jour.', () => onSave?.())
      }
      else {
        showError('Erreur', 'Impossible d\'enregistrer les horaires.')
      }
    }
    catch {
      showError('Erreur', 'Impossible d\'enregistrer les horaires.')
    }
    finally {
      setIsSaving(false)
    }
  }

  function renderTimePicker(
    dayKey: string,
    hourField: 'openHour' | 'closeHour',
    minuteField: 'openMinute' | 'closeMinute',
    label: string,
  ): React.ReactNode {
    const day = schedule[dayKey]
    const selectedHour = day[hourField]
    const selectedMinute = day[minuteField]

    return (
      <View style={styles.timePickerContainer}>
        <Text style={[styles.timeLabel, { color: semantic.textSecondary }]}>{label}</Text>
        <View style={styles.timePickerRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timeScrollContent}
          >
            {HOURS.map(h => (
              <TouchableOpacity
                key={`${dayKey}-${hourField}-${h}`}
                style={[
                  styles.timeChip,
                  { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal },
                  selectedHour === h && styles.timeChipActive,
                ]}
                onPress={() => handleUpdateTime(dayKey, hourField, h)}
                accessibilityLabel={`${h} heures`}
              >
                <Text
                  style={[
                    styles.timeChipText,
                    { color: semantic.textSecondary },
                    selectedHour === h && styles.timeChipTextActive,
                  ]}
                >
                  {h}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[styles.timeSeparator, { color: semantic.textTertiary }]}>:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timeScrollContent}
          >
            {MINUTES.map(m => (
              <TouchableOpacity
                key={`${dayKey}-${minuteField}-${m}`}
                style={[
                  styles.timeChip,
                  { backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal },
                  selectedMinute === m && styles.timeChipActive,
                ]}
                onPress={() => handleUpdateTime(dayKey, minuteField, m)}
                accessibilityLabel={`${m} minutes`}
              >
                <Text
                  style={[
                    styles.timeChipText,
                    { color: semantic.textSecondary },
                    selectedMinute === m && styles.timeChipTextActive,
                  ]}
                >
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator size="large" color={colors.green[400]} />
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title="Horaires d'ouverture" onBack={onGoBack} />
      <ScrollView
        style={[styles.screen, { backgroundColor: semantic.bgPage }]}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >

        <TouchableOpacity
          style={styles.closeTodayButton}
          onPress={handleCloseToday}
          accessibilityLabel="Fermer aujourd'hui"
        >
          <Lock size={14} color={colors.coral[600]} style={{ marginRight: 6 }} />
          <Text style={styles.closeTodayText}>
            Fermé aujourd'hui
          </Text>
        </TouchableOpacity>

        {DAYS_OF_WEEK.map((day) => {
          const daySchedule = schedule[day.key]
          return (
            <View key={day.key} style={[styles.dayCard, { backgroundColor: semantic.bgCard, borderColor: semantic.borderNormal }]}>
              <View style={styles.dayHeader}>
                <Text style={[styles.dayLabel, { color: semantic.textPrimary }]}>{day.label}</Text>
                <View style={styles.dayToggleRow}>
                  <Text style={[styles.dayStatus, { color: semantic.textTertiary }]}>
                    {daySchedule.isOpen ? 'Ouvert' : 'Fermé'}
                  </Text>
                  <Switch
                    value={daySchedule.isOpen}
                    onValueChange={() => handleToggleDay(day.key)}
                    trackColor={{
                      false: colors.neutral[200],
                      true: colors.green[200],
                    }}
                    thumbColor={
                      daySchedule.isOpen
                        ? colors.green[400]
                        : colors.neutral[400]
                    }
                    accessibilityLabel={`${day.label} ouvert ou fermé`}
                  />
                </View>
              </View>

              {daySchedule.isOpen && (
                <View style={[styles.timeSection, { borderTopColor: semantic.borderLight }]}>
                  {renderTimePicker(day.key, 'openHour', 'openMinute', 'Ouverture')}
                  {renderTimePicker(
                    day.key,
                    'closeHour',
                    'closeMinute',
                    'Fermeture',
                  )}
                  <Text style={[styles.timeSummary, { color: semantic.textPrimaryColor }]}>
                    {daySchedule.openHour}
                    :
                    {daySchedule.openMinute}
                    {' '}
                    {'\u2014'}
                    {' '}
                    {daySchedule.closeHour}
                    :
                    {daySchedule.closeMinute}
                  </Text>
                </View>
              )}
            </View>
          )
        })}

        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityLabel="Enregistrer les horaires"
        >
          {isSaving
            ? (
                <ActivityIndicator size="small" color={colors.neutral[0]} />
              )
            : (
                <Text style={styles.saveButtonText}>Enregistrer</Text>
              )}
        </TouchableOpacity>

        <ConfirmModal
          visible={modal.visible}
          icon={modal.type === 'success' ? CircleCheck : TriangleAlert}
          iconColor={modal.type === 'success' ? colors.green[600] : colors.coral[600]}
          iconBg={modal.type === 'success' ? colors.green[50] : colors.coral[50]}
          title={modal.title}
          message={modal.message}
          confirmLabel="OK"
          confirmStyle="primary"
          onConfirm={() => {
            const onConfirm = modal.onConfirm
            setModal(prev => ({ ...prev, visible: false }))
            onConfirm?.()
          }}
          onCancel={() => setModal(prev => ({ ...prev, visible: false }))}
        />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[10],
    gap: spacing[3],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.h1,
  },
  closeTodayButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral[50],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.coral[200],
  },
  closeTodayText: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
    color: colors.coral[600],
  },
  dayCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing[3],
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  dayLabel: {
    ...typography.h3,
  },
  dayToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  dayStatus: {
    ...typography.caption,
  },
  timeSection: {
    marginTop: spacing[2],
    gap: spacing[2],
    borderTopWidth: 1,
    paddingTop: spacing[2],
  },
  timePickerContainer: {
    gap: spacing[1],
  },
  timeLabel: {
    ...typography.caption,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeScrollContent: {
    gap: spacing[1],
  },
  timeChip: {
    minHeight: 36,
    minWidth: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  timeChipActive: {
    backgroundColor: colors.green[50],
    borderColor: colors.green[400],
  },
  timeChipText: {
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  timeChipTextActive: {
    color: colors.green[800],
  },
  timeSeparator: {
    fontFamily: fonts.mono,
    fontSize: 16,
    marginHorizontal: spacing[1],
  },
  timeSummary: {
    ...typography.bodyS,
    fontFamily: fonts.mono,
    textAlign: 'center',
  },
  saveButton: {
    minHeight: 44,
    backgroundColor: colors.green[400],
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing[2],
  },
  saveButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 16,
    color: colors.neutral[0],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
