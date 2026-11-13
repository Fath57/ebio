import Gift from 'lucide-react-native/dist/esm/icons/gift'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MapPinCheck from 'lucide-react-native/dist/esm/icons/map-pin-check'
import User from 'lucide-react-native/dist/esm/icons/user'
import * as React from 'react'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { useLocation } from '../../common/location-context'
import { LocationPickerScreen } from '../../map/components/location-picker-screen'
import { geocodeAddress } from '../../map/utils/geocode-address'

export type DeliveryTarget = 'SELF' | 'RELATIVE'

/** Mirrors the API rule on the recipient phone (contracts/diaspora.md §1). */
export const RECIPIENT_PHONE_PATTERN = /^\+229\d{10}$/

/** Same floor as the buyer's own address: the courier has only this to find the door. */
export const RECIPIENT_MIN_ADDRESS_LENGTH = 10

export const RECIPIENT_PHONE_PREFIX = '+229'

/**
 * The person the basket goes to. Kept by the checkout screen only, never in
 * the checkout draft: the draft holds the payer's own address.
 */
export interface RecipientDraft {
  name: string
  phone: string
  address: string
  position: { latitude: number, longitude: number } | null
  placeLabel: string | null
  /** Set when the recipient comes from the saved relatives list (T070). */
  savedRelativeId: string | null
}

export const EMPTY_RECIPIENT: RecipientDraft = {
  name: '',
  phone: RECIPIENT_PHONE_PREFIX,
  address: '',
  position: null,
  placeLabel: null,
  savedRelativeId: null,
}

/** Removes spaces and dots typed between digit groups. */
export function normalizeRecipientPhone(phone: string): string {
  return phone.replace(/[\s.-]/g, '')
}

/** First blocking problem of the recipient form, or null when it can be sent. */
export function recipientProblem(recipient: RecipientDraft): string | null {
  if (recipient.name.trim().length === 0) {
    return 'Indiquez le nom de votre proche.'
  }
  if (!RECIPIENT_PHONE_PATTERN.test(normalizeRecipientPhone(recipient.phone))) {
    return 'Le numéro doit être béninois : +229 suivi de 10 chiffres.'
  }
  if (recipient.address.trim().length < RECIPIENT_MIN_ADDRESS_LENGTH) {
    return 'Ajoutez le quartier et un repère pour que le livreur trouve votre proche.'
  }
  return null
}

interface TargetOptionProps {
  label: string
  hint: string
  selected: boolean
  icon: React.ReactNode
  onPress: () => void
}

function TargetOption({ label, hint, selected, icon, onPress }: TargetOptionProps) {
  const { semantic } = useTheme()
  return (
    <TouchableOpacity
      style={[
        styles.option,
        {
          backgroundColor: selected ? semantic.bgPrimaryLight : semantic.bgSurface,
          borderColor: selected ? colors.green[400] : semantic.borderNormal,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      {icon}
      <View style={styles.optionText}>
        <Text style={[styles.optionLabel, { color: semantic.textPrimary }]}>{label}</Text>
        <Text style={[styles.optionHint, { color: semantic.textSecondary }]}>{hint}</Text>
      </View>
    </TouchableOpacity>
  )
}

export interface RecipientStepProps {
  target: DeliveryTarget
  onTargetChange: (target: DeliveryTarget) => void
  recipient: RecipientDraft
  onRecipientChange: (recipient: RecipientDraft) => void
  /**
   * Rendered above the form when « Livrer à un proche » is chosen: the place
   * for the saved relatives list (T070), which fills `recipient` on a tap.
   */
  savedRelativesSlot?: React.ReactNode
}

/**
 * « Me livrer » or « Livrer à un proche ». The first leaves the checkout's own
 * address fields in charge; the second collects the recipient's name, phone,
 * address and door point.
 */
export function RecipientStep({ target, onTargetChange, recipient, onRecipientChange, savedRelativesSlot }: RecipientStepProps) {
  const { semantic } = useTheme()
  const { latitude: currentLatitude, longitude: currentLongitude } = useLocation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerStart, setPickerStart] = useState<{ latitude: number, longitude: number } | null>(null)
  const [locating, setLocating] = useState(false)

  const update = useCallback((patch: Partial<RecipientDraft>) => {
    // Any edit by hand detaches the form from the saved relative it came from.
    onRecipientChange({ ...recipient, savedRelativeId: null, ...patch })
  }, [recipient, onRecipientChange])

  const openPicker = useCallback(async () => {
    if (!recipient.position && recipient.address.trim().length >= 3) {
      setLocating(true)
      const found = await geocodeAddress(recipient.address)
      setLocating(false)
      if (found) {
        setPickerStart({ latitude: found.latitude, longitude: found.longitude })
      }
    }
    setPickerOpen(true)
  }, [recipient.position, recipient.address])

  const phone = normalizeRecipientPhone(recipient.phone)
  const phoneInvalid = phone.length > RECIPIENT_PHONE_PREFIX.length && !RECIPIENT_PHONE_PATTERN.test(phone)
  const addressLength = recipient.address.trim().length
  const addressTooShort = addressLength > 0 && addressLength < RECIPIENT_MIN_ADDRESS_LENGTH
  const position = recipient.position

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: semantic.textSecondary }]}>À qui livrer ?</Text>
      <View style={styles.options} accessibilityRole="radiogroup">
        <TargetOption
          label="Me livrer"
          hint="À votre adresse"
          selected={target === 'SELF'}
          icon={<User size={18} color={target === 'SELF' ? colors.green[600] : semantic.textSecondary} strokeWidth={2} />}
          onPress={() => onTargetChange('SELF')}
        />
        <TargetOption
          label="Livrer à un proche"
          hint="Au Bénin, payé par vous"
          selected={target === 'RELATIVE'}
          icon={<Gift size={18} color={target === 'RELATIVE' ? colors.green[600] : semantic.textSecondary} strokeWidth={2} />}
          onPress={() => onTargetChange('RELATIVE')}
        />
      </View>

      {target === 'RELATIVE' && (
        <View style={styles.form}>
          {savedRelativesSlot}

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom du proche *</Text>
          <TextInput
            style={[styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]}
            placeholder="Prénom et nom"
            placeholderTextColor={semantic.textTertiary}
            value={recipient.name}
            onChangeText={name => update({ name })}
            autoCapitalize="words"
            textContentType="name"
            accessibilityLabel="Nom du proche"
          />

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Téléphone du proche *</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: semantic.textPrimary,
                backgroundColor: semantic.bgSurface,
                borderColor: phoneInvalid ? colors.coral[600] : semantic.borderNormal,
              },
            ]}
            placeholder="+229 01 97 12 34 56"
            placeholderTextColor={semantic.textTertiary}
            value={recipient.phone}
            onChangeText={value => update({ phone: value })}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            accessibilityLabel="Téléphone du proche"
          />
          <Text style={[styles.hint, { color: phoneInvalid ? colors.coral[600] : semantic.textTertiary }]}>
            {phoneInvalid
              ? 'Numéro béninois attendu : +229 suivi de 10 chiffres.'
              : 'Votre proche reçoit par SMS le suivi et le code à donner au livreur.'}
          </Text>

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Position de livraison</Text>
          <TouchableOpacity
            style={[
              styles.positionCard,
              position
                ? { backgroundColor: semantic.bgPrimaryLight, borderColor: colors.green[400] }
                : { backgroundColor: colors.green[400], borderColor: colors.green[400] },
            ]}
            onPress={() => {
              void openPicker()
            }}
            disabled={locating}
            accessibilityRole="button"
            accessibilityLabel={position ? 'Modifier la position de votre proche sur la carte' : 'Choisir la position de votre proche sur la carte'}
          >
            {locating
              ? <ActivityIndicator size="small" color={position ? colors.green[800] : colors.neutral[0]} />
              : position
                ? <MapPinCheck size={22} color={colors.green[800]} strokeWidth={2.2} />
                : <MapPin size={22} color={colors.neutral[0]} strokeWidth={2.2} />}
            <View style={styles.positionText}>
              <Text style={[styles.positionTitle, { color: position ? colors.green[800] : colors.neutral[0] }]}>
                {position ? 'Position enregistrée' : 'Choisir sa position sur la carte'}
              </Text>
              <Text style={[styles.positionHint, { color: position ? semantic.textSecondary : colors.green[50] }]}>
                {position
                  ? `${recipient.placeLabel ?? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`} · Appuyez pour modifier`
                  : 'Placez le repère à la porte de votre proche : le tarif se calcule depuis ce point'}
              </Text>
            </View>
          </TouchableOpacity>

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Adresse du proche *</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: semantic.textPrimary,
                backgroundColor: semantic.bgSurface,
                borderColor: addressTooShort ? colors.coral[600] : semantic.borderNormal,
              },
            ]}
            placeholder="Quartier, rue, repère (ex. portail bleu après la pharmacie)"
            placeholderTextColor={semantic.textTertiary}
            value={recipient.address}
            onChangeText={address => update({ address })}
            multiline
            accessibilityLabel="Adresse du proche"
          />
          <Text style={[styles.hint, { color: addressTooShort ? colors.coral[600] : semantic.textTertiary }]}>
            {addressTooShort
              ? 'Trop court pour guider le livreur : ajoutez le quartier et un repère.'
              : 'Le quartier et un repère suffisent : c\'est ce que le livreur lit pour trouver votre proche.'}
          </Text>
        </View>
      )}

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <LocationPickerScreen
          initialLatitude={position?.latitude ?? pickerStart?.latitude ?? currentLatitude}
          initialLongitude={position?.longitude ?? pickerStart?.longitude ?? currentLongitude}
          precision="door"
          // The payer is usually far from the recipient: their own GPS fix
          // would be a wrong start, so the map opens on the typed address or
          // the town being browsed.
          locateOnOpen={false}
          onConfirm={(coords) => {
            update({ position: { latitude: coords.latitude, longitude: coords.longitude }, placeLabel: coords.label ?? null })
            setPickerOpen(false)
          }}
          onGoBack={() => setPickerOpen(false)}
        />
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[2],
  },
  options: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
  optionHint: {
    ...typography.caption,
  },
  form: {
    gap: spacing[2],
    marginTop: spacing[2],
  },
  label: {
    ...typography.caption,
    marginTop: spacing[1],
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  hint: {
    ...typography.caption,
  },
  positionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 64,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  positionText: {
    flex: 1,
  },
  positionTitle: {
    ...typography.bodyL,
    fontFamily: fonts.sansSb,
  },
  positionHint: {
    ...typography.caption,
    marginTop: 2,
  },
})
