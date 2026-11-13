import ContactRound from 'lucide-react-native/dist/esm/icons/contact-round'
import * as React from 'react'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { colors, fonts, radius, spacing } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { appAlert } from '../../common/components/app-alert'
import { contactPickerAvailable, pickContact, toBeninPhone } from '../pick-contact'

export interface ContactPickButtonProps {
  /** `phone` is a `+229…` number, or the raw number when none is Beninese. */
  onPicked: (name: string, phone: string) => void
}

/** At most this many numbers are offered in the choice dialog, plus « Annuler ». */
const MAX_CHOICES = 3

/**
 * « Choisir dans mes contacts » — fills the relative's name and phone from the
 * phone's address book instead of typing them for every order. Hidden on a
 * build that does not carry the contacts module.
 */
export function ContactPickButton({ onPicked }: ContactPickButtonProps) {
  const { semantic } = useTheme()
  const [busy, setBusy] = useState(false)

  const handlePress = useCallback(async () => {
    setBusy(true)
    const result = await pickContact()
    setBusy(false)

    if (result.status === 'denied') {
      appAlert(
        'Accès aux contacts refusé',
        'Autorisez eBio à lire vos contacts dans les réglages du téléphone, ou saisissez le numéro à la main.',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Ouvrir les réglages', onPress: () => void Linking.openSettings() },
        ],
      )
      return
    }
    if (result.status === 'failed') {
      appAlert('Contacts indisponibles', 'Saisissez le nom et le numéro à la main.')
      return
    }
    if (result.status !== 'picked')
      return

    const { name, phones } = result.contact
    const benin = [...new Set(phones.map(toBeninPhone).filter((phone): phone is string => phone !== null))]

    if (benin.length === 1) {
      onPicked(name, benin[0])
      return
    }
    if (benin.length > 1) {
      appAlert(
        'Quel numéro ?',
        `${name || 'Ce contact'} a plusieurs numéros béninois. Le SMS de suivi partira sur celui que vous choisissez.`,
        [
          ...benin.slice(0, MAX_CHOICES).map(phone => ({ text: phone, onPress: () => onPicked(name, phone) })),
          { text: 'Annuler', style: 'cancel' },
        ],
      )
      return
    }
    // No Benin number: keep the name, show the number so the buyer can fix it.
    onPicked(name, phones[0] ?? '')
    appAlert(
      'Pas de numéro béninois',
      phones.length > 0
        ? 'Ce contact n\'a pas de numéro béninois. Votre proche doit avoir un numéro +229 pour recevoir le SMS : corrigez-le si besoin.'
        : 'Ce contact n\'a pas de numéro. Saisissez le numéro béninois de votre proche.',
    )
  }, [onPicked])

  if (!contactPickerAvailable())
    return null

  return (
    <TouchableOpacity
      style={[styles.button, { borderColor: colors.green[400], backgroundColor: semantic.bgPrimaryLight }]}
      onPress={() => void handlePress()}
      disabled={busy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Choisir le proche dans mes contacts"
    >
      {busy
        ? <ActivityIndicator size="small" color={colors.green[600]} />
        : <ContactRound size={18} color={colors.green[600]} strokeWidth={2} />}
      <Text style={[styles.label, { color: colors.green[600] }]}>Choisir dans mes contacts</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
  },
  label: {
    fontFamily: fonts.sansSb,
    fontSize: 14,
  },
})
