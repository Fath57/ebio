import type { CourierProfile, VehicleType } from '../types'
import type { CourierZone } from './zone-picker'
import FileCheck from 'lucide-react-native/dist/esm/icons/file-check'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import Upload from 'lucide-react-native/dist/esm/icons/upload'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { useMediaUpload } from '../../media/hooks/use-media-upload'
import { VEHICLE_LABELS } from '../types'
import { ZonePickerModal } from './zone-picker'

interface CourierRegistrationFormProps {
  /** Existing profile when editing a rejected application. */
  existing?: CourierProfile | null
  onSubmitted: () => void
  onBack: () => void
}

const VEHICLES = Object.keys(VEHICLE_LABELS) as VehicleType[]

/** Courier application form — creation and resubmission share it. */
export function CourierRegistrationForm({ existing, onSubmitted, onBack: _onBack }: CourierRegistrationFormProps) {
  const { semantic } = useTheme()
  const [fullName, setFullName] = useState(existing?.fullName ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '+229')
  const [vehicleType, setVehicleType] = useState<VehicleType>(existing?.vehicleType ?? 'MOTO')
  // Map-picked zone: prefilled only when the existing profile already carries
  // coordinates, so an untouched edit never overwrites them with defaults.
  const [zone, setZone] = useState<CourierZone | null>(
    existing && existing.zoneLatitude != null && existing.zoneLongitude != null
      ? {
          label: existing.zone,
          latitude: existing.zoneLatitude,
          longitude: existing.zoneLongitude,
          radiusKm: existing.zoneRadiusKm ?? 10,
        }
      : null,
  )
  const [zoneLegacyLabel] = useState(existing?.zone ?? '')
  const [zonePickerOpen, setZonePickerOpen] = useState(false)
  const [identityDocument, setIdentityDocument] = useState<string | null>(existing?.identityDocument ?? null)
  const [submitting, setSubmitting] = useState(false)
  const { pickDocumentAndUpload, uploading } = useMediaUpload({ context: 'IDENTITY_DOCUMENT' })

  async function pickDocument() {
    const uploaded = await pickDocumentAndUpload()
    if (uploaded) {
      setIdentityDocument(uploaded.mediaId)
    }
  }

  async function submit() {
    const zoneLabel = zone?.label ?? zoneLegacyLabel
    if (fullName.trim().length < 2) {
      appAlert('Champs manquants', 'Renseignez votre nom complet.')
      return
    }
    if (!zone && zoneLegacyLabel.length < 2) {
      appAlert('Zone manquante', 'Choisissez votre zone de livraison sur la carte.')
      return
    }
    if (!/^\+229\d{10}$/.test(phone.trim())) {
      appAlert('Téléphone invalide', 'Le numéro doit être au format +229 suivi de 10 chiffres.')
      return
    }
    setSubmitting(true)
    try {
      const body = JSON.stringify({
        fullName: fullName.trim(),
        phone: phone.trim(),
        vehicleType,
        zone: zoneLabel.trim(),
        zoneLatitude: zone?.latitude,
        zoneLongitude: zone?.longitude,
        zoneRadiusKm: zone?.radiusKm,
        identityDocument: identityDocument ?? undefined,
      })
      const res = existing
        ? await apiFetch('/api/couriers/me', { method: 'PATCH', body })
        : await apiFetch('/api/couriers/register', { method: 'POST', body })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { message?: string }
        appAlert('Erreur', data.message ?? 'La candidature n\'a pas pu être envoyée. Réessayez.')
        return
      }
      onSubmitted()
    }
    catch {
      appAlert('Hors connexion', 'Vérifiez votre connexion internet puis réessayez.')
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAwareView style={{ flex: 1, backgroundColor: semantic.bgPage }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom complet</Text>
        <TextInput
          style={[styles.input, { backgroundColor: semantic.bgCard, color: semantic.textPrimary, borderColor: semantic.borderNormal }]}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Votre nom et prénom"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Nom complet"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Téléphone</Text>
        <TextInput
          style={[styles.input, { backgroundColor: semantic.bgCard, color: semantic.textPrimary, borderColor: semantic.borderNormal }]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+2290100000000"
          placeholderTextColor={semantic.textTertiary}
          accessibilityLabel="Numéro de téléphone"
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Moyen de transport</Text>
        <View style={styles.vehicles}>
          {VEHICLES.map((vehicle) => {
            const active = vehicleType === vehicle
            return (
              <Pressable
                key={vehicle}
                style={[
                  styles.vehicleChip,
                  { borderColor: semantic.borderNormal, backgroundColor: semantic.bgCard },
                  active && { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[400] },
                ]}
                onPress={() => setVehicleType(vehicle)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={VEHICLE_LABELS[vehicle]}
              >
                <Text style={[styles.vehicleText, { color: active ? semantic.textPrimaryColor : semantic.textSecondary }]}>
                  {VEHICLE_LABELS[vehicle]}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Zone de livraison</Text>
        <Pressable
          style={[styles.zoneField, { backgroundColor: semantic.bgCard, borderColor: zone ? colors.green[400] : semantic.borderNormal }]}
          onPress={() => setZonePickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Choisir ma zone de livraison sur la carte"
        >
          <MapPin size={18} color={zone ? colors.green[600] : semantic.textTertiary} strokeWidth={2} />
          <Text style={[styles.zoneText, { color: zone ? semantic.textPrimary : semantic.textTertiary }]} numberOfLines={1}>
            {zone
              ? `${zone.label} — rayon ${zone.radiusKm} km`
              : zoneLegacyLabel || 'Choisir sur la carte'}
          </Text>
          <Text style={[styles.zoneAction, { color: semantic.textPrimaryColor }]}>
            {zone || zoneLegacyLabel ? 'Modifier' : 'Ouvrir'}
          </Text>
        </Pressable>

        <ZonePickerModal
          visible={zonePickerOpen}
          initial={zone}
          onConfirm={(picked) => {
            setZone(picked)
            setZonePickerOpen(false)
          }}
          onClose={() => setZonePickerOpen(false)}
        />

        <Text style={[styles.label, { color: semantic.textSecondary }]}>Pièce d'identité (optionnel)</Text>
        <Pressable
          style={[styles.uploadButton, { borderColor: semantic.borderNormal, backgroundColor: semantic.bgCard }]}
          onPress={pickDocument}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Ajouter une pièce d'identité"
        >
          {uploading
            ? <ActivityIndicator size="small" color={colors.green[400]} />
            : identityDocument
              ? <FileCheck size={18} color={colors.green[600]} strokeWidth={2} />
              : <Upload size={18} color={semantic.textTertiary} strokeWidth={2} />}
          <Text style={[styles.uploadText, { color: identityDocument ? semantic.textPrimaryColor : semantic.textSecondary }]}>
            {identityDocument ? 'Document ajouté' : 'Ajouter une photo ou un PDF'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.submit, submitting && styles.submitDisabled]}
          onPress={submit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={existing ? 'Renvoyer ma candidature' : 'Envoyer ma candidature'}
        >
          {submitting
            ? <ActivityIndicator size="small" color={colors.neutral[0]} />
            : <Text style={styles.submitText}>{existing ? 'Renvoyer ma candidature' : 'Envoyer ma candidature'}</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAwareView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  label: {
    ...typography.caption,
    marginBottom: spacing[1],
    marginTop: spacing[4],
  },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    ...typography.bodyL,
  },
  vehicles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  vehicleChip: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleText: {
    ...typography.caption,
    fontSize: 13,
  },
  zoneField: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
  },
  zoneText: {
    flex: 1,
    ...typography.bodyL,
  },
  zoneAction: {
    ...typography.caption,
    fontSize: 13,
  },
  uploadButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  uploadText: {
    ...typography.bodyS,
  },
  submit: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[6],
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.neutral[0],
  },
})
