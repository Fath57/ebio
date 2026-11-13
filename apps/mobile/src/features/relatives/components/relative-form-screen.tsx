import type { Relative } from '../relatives-api'
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin'
import MapPinCheck from 'lucide-react-native/dist/esm/icons/map-pin-check'
import * as React from 'react'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import {
  normalizeRecipientPhone,
  RECIPIENT_MIN_ADDRESS_LENGTH,
  RECIPIENT_PHONE_PATTERN,
  RECIPIENT_PHONE_PREFIX,
} from '../../cart/components/recipient-step'
import { appAlert } from '../../common/components/app-alert'
import { KeyboardAwareView } from '../../common/components/keyboard-aware-view'
import { ScreenHeader } from '../../common/components/screen-header'
import { useLocation } from '../../common/location-context'
import { LocationPickerScreen } from '../../map/components/location-picker-screen'
import { geocodeAddress } from '../../map/utils/geocode-address'
import { relativePosition, saveRelative } from '../relatives-api'
import { ContactPickButton } from './contact-pick-button'

const NICKNAME_MAX = 40
const NAME_MAX = 120

interface RelativeFormScreenProps {
  /** The relative to edit; null to add one. */
  relative: Relative | null
  onSaved: () => void
  onBack: () => void
}

/**
 * First blocking problem of the form, or null when it can be saved. The
 * address is optional (a family wallet member needs none), but an address
 * and a door point go together: one without the other is no use to a courier.
 */
function formProblem(nickname: string, name: string, phone: string, address: string, position: unknown): string | null {
  if (nickname.trim().length === 0)
    return 'Donnez un surnom à votre proche (ex. Maman).'
  if (name.trim().length === 0)
    return 'Indiquez le nom de votre proche.'
  if (!RECIPIENT_PHONE_PATTERN.test(normalizeRecipientPhone(phone)))
    return 'Le numéro doit être béninois : +229 suivi de 10 chiffres.'
  const hasAddress = address.trim().length > 0
  if (!hasAddress && !position)
    return null
  if (address.trim().length < RECIPIENT_MIN_ADDRESS_LENGTH)
    return 'Ajoutez le quartier et un repère pour que le livreur trouve votre proche.'
  if (!position)
    return 'Placez le repère à la porte de votre proche sur la carte.'
  return null
}

/** Adds or edits one saved relative: nickname, name, phone, address and door point. */
export function RelativeFormScreen({ relative, onSaved, onBack }: RelativeFormScreenProps) {
  const { semantic } = useTheme()
  const { latitude: currentLatitude, longitude: currentLongitude } = useLocation()
  const [nickname, setNickname] = useState(relative?.nickname ?? '')
  const [name, setName] = useState(relative?.name ?? '')
  const [phone, setPhone] = useState(relative?.phone ?? RECIPIENT_PHONE_PREFIX)
  const [address, setAddress] = useState(relative?.address ?? '')
  const [position, setPosition] = useState<{ latitude: number, longitude: number } | null>(
    () => (relative ? relativePosition(relative) : null),
  )
  const [placeLabel, setPlaceLabel] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerStart, setPickerStart] = useState<{ latitude: number, longitude: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)

  const normalizedPhone = normalizeRecipientPhone(phone)
  const phoneInvalid = normalizedPhone.length > RECIPIENT_PHONE_PREFIX.length && !RECIPIENT_PHONE_PATTERN.test(normalizedPhone)

  const openPicker = useCallback(async () => {
    if (!position && address.trim().length >= 3) {
      setLocating(true)
      const found = await geocodeAddress(address)
      setLocating(false)
      if (found)
        setPickerStart({ latitude: found.latitude, longitude: found.longitude })
    }
    setPickerOpen(true)
  }, [position, address])

  const handleSave = useCallback(async () => {
    const problem = formProblem(nickname, name, phone, address, position)
    if (problem) {
      appAlert('Informations incomplètes', problem)
      return
    }
    setSaving(true)
    const result = await saveRelative({
      nickname: nickname.trim(),
      name: name.trim(),
      phone: normalizedPhone,
      address: position ? address.trim() : null,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
    }, relative?.id)
    setSaving(false)
    if (result.error !== null) {
      appAlert('Enregistrement impossible', result.error)
      return
    }
    onSaved()
  }, [nickname, name, phone, address, position, normalizedPhone, relative?.id, onSaved])

  const inputStyle = [styles.input, { color: semantic.textPrimary, backgroundColor: semantic.bgSurface, borderColor: semantic.borderNormal }]

  return (
    <View style={[styles.screen, { backgroundColor: semantic.bgPage }]}>
      <ScreenHeader title={relative ? `Modifier ${relative.nickname}` : 'Ajouter un proche'} onBack={onBack} />
      <KeyboardAwareView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: semantic.textSecondary }]}>Surnom *</Text>
          <TextInput
            style={inputStyle}
            placeholder="Maman, Tonton Koffi…"
            placeholderTextColor={semantic.textTertiary}
            value={nickname}
            onChangeText={setNickname}
            maxLength={NICKNAME_MAX}
            autoCapitalize="words"
            accessibilityLabel="Surnom"
          />

          <ContactPickButton
            onPicked={(pickedName, pickedPhone) => {
              setName(pickedName)
              setPhone(pickedPhone)
            }}
          />

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Nom du proche *</Text>
          <TextInput
            style={inputStyle}
            placeholder="Prénom et nom"
            placeholderTextColor={semantic.textTertiary}
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            textContentType="name"
            accessibilityLabel="Nom du proche"
          />

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Téléphone du proche *</Text>
          <TextInput
            style={[...inputStyle, phoneInvalid && { borderColor: colors.coral[600] }]}
            placeholder="+229 01 97 12 34 56"
            placeholderTextColor={semantic.textTertiary}
            value={phone}
            onChangeText={setPhone}
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
          <Text style={[styles.hint, { color: semantic.textTertiary }]}>
            La position et l’adresse sont facultatives pour un proche du portefeuille famille, mais nécessaires pour lui faire livrer une commande.
          </Text>
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
                  ? `${placeLabel ?? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`} · Appuyez pour modifier`
                  : 'Placez le repère à la porte de votre proche'}
              </Text>
            </View>
          </TouchableOpacity>

          <Text style={[styles.label, { color: semantic.textSecondary }]}>Adresse du proche</Text>
          <TextInput
            style={[...inputStyle, styles.multiline]}
            placeholder="Quartier, rue, repère (ex. portail bleu après la pharmacie)"
            placeholderTextColor={semantic.textTertiary}
            value={address}
            onChangeText={setAddress}
            multiline
            accessibilityLabel="Adresse du proche"
          />
        </ScrollView>
      </KeyboardAwareView>

      <View style={[styles.footer, { borderTopColor: semantic.borderLight }]}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonBusy]}
          onPress={() => {
            void handleSave()
          }}
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ busy: saving }}
        >
          {saving
            ? <ActivityIndicator color={colors.neutral[0]} />
            : <Text style={styles.saveButtonText}>Enregistrer</Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <LocationPickerScreen
          initialLatitude={position?.latitude ?? pickerStart?.latitude ?? currentLatitude}
          initialLongitude={position?.longitude ?? pickerStart?.longitude ?? currentLongitude}
          precision="door"
          // The payer is usually far from the relative: their own GPS fix
          // would be a wrong start.
          locateOnOpen={false}
          onConfirm={(coords) => {
            setPosition({ latitude: coords.latitude, longitude: coords.longitude })
            setPlaceLabel(coords.label ?? null)
            setPickerOpen(false)
          }}
          onGoBack={() => setPickerOpen(false)}
        />
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    gap: spacing[2],
  },
  label: {
    ...typography.caption,
    marginTop: spacing[2],
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
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
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
  footer: {
    padding: spacing[4],
    borderTopWidth: 1,
  },
  saveButton: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonBusy: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontFamily: fonts.sansSb,
    fontSize: 15,
    color: colors.neutral[0],
  },
})
