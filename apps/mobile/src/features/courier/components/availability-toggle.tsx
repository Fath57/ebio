import * as Location from 'expo-location'
import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native'
import { colors, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'

interface AvailabilityToggleProps {
  isAvailable: boolean
  onChanged: (isAvailable: boolean) => void
}

/**
 * Online/offline switch. Going online first reports the current position so
 * the dispatch can offer nearby deliveries (foreground-only, spec R5).
 */
export function AvailabilityToggle({ isAvailable, onChanged }: AvailabilityToggleProps) {
  const { semantic } = useTheme()
  const [busy, setBusy] = useState(false)

  async function toggle(next: boolean) {
    setBusy(true)
    try {
      if (next) {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (permission.granted) {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          await apiFetch('/api/couriers/me/location', {
            method: 'PATCH',
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
          })
        }
        else {
          appAlert('Position requise', 'Sans votre position, seules les courses sans localisation vous seront proposées.')
        }
      }
      const res = await apiFetch('/api/couriers/me/availability', {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: next }),
      })
      if (res.ok) {
        onChanged(next)
      }
      else {
        appAlert('Erreur', 'Impossible de changer votre disponibilité. Réessayez.')
      }
    }
    catch {
      appAlert('Hors connexion', 'Vérifiez votre connexion internet puis réessayez.')
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.row}>
      {busy
        ? <ActivityIndicator size="small" color={colors.green[400]} />
        : (
            <Text style={[styles.label, { color: isAvailable ? semantic.textPrimaryColor : semantic.textTertiary }]}>
              {isAvailable ? 'En ligne' : 'Hors ligne'}
            </Text>
          )}
      <Switch
        value={isAvailable}
        onValueChange={toggle}
        disabled={busy}
        trackColor={{ false: colors.neutral[200], true: colors.green[200] }}
        thumbColor={isAvailable ? colors.green[400] : colors.neutral[0]}
        accessibilityLabel={isAvailable ? 'Passer hors ligne' : 'Passer en ligne'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  label: {
    ...typography.caption,
  },
})
