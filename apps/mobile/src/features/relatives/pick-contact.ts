import { requireOptionalNativeModule } from 'expo-modules-core'
import { Platform } from 'react-native'

/**
 * What the phone's contact picker hands back, reduced to what a relative needs.
 * `phones` are the raw numbers as stored in the address book.
 */
export interface PickedContact {
  name: string
  phones: string[]
}

export type PickContactResult
  = | { status: 'picked', contact: PickedContact }
    | { status: 'cancelled' }
    | { status: 'denied' }
    | { status: 'failed' }

/**
 * Whether this binary carries the contacts module. A build made before it was
 * added has only the JS half, and importing it then crashes the module graph
 * at evaluation, the native side is asked for first (same guard as analytics).
 */
export function contactPickerAvailable(): boolean {
  return requireOptionalNativeModule('ExpoContacts') !== null
}

/**
 * A Benin number in the form the API expects (`+229` + 10 digits), or null.
 *
 * Address books hold every shape: `+229 01 97…`, `00229…`, `229…`, the
 * 10-digit local form `01 97…`, and the pre-2024 8-digit form, which became
 * the 10-digit one by prefixing `01`.
 */
export function toBeninPhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('00'))
    digits = `+${digits.slice(2)}`
  if (digits.startsWith('+229'))
    digits = digits.slice(4)
  else if (digits.startsWith('+'))
    return null
  else if (digits.startsWith('229') && digits.length > 10)
    digits = digits.slice(3)

  if (/^01\d{8}$/.test(digits))
    return `+229${digits}`
  if (/^\d{8}$/.test(digits))
    return `+22901${digits}`
  return null
}

/**
 * Opens the system contact picker.
 *
 * Android reads the chosen contact's numbers through the address book, which
 * needs READ_CONTACTS, asked here, at the moment of the tap, never at launch.
 * Nothing from the address book leaves the phone: only the chosen name and
 * number fill the form.
 */
export async function pickContact(): Promise<PickContactResult> {
  if (!contactPickerAvailable())
    return { status: 'failed' }
  try {
    const Contacts = await import('expo-contacts')
    if (Platform.OS === 'android') {
      const { granted } = await Contacts.requestPermissionsAsync()
      if (!granted)
        return { status: 'denied' }
    }
    const contact = await Contacts.presentContactPickerAsync()
    if (!contact)
      return { status: 'cancelled' }
    const name = (contact.name ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')).trim()
    const phones = (contact.phoneNumbers ?? [])
      .map(entry => entry.number ?? entry.digits ?? '')
      .filter(value => value.length > 0)
    return { status: 'picked', contact: { name, phones } }
  }
  catch (error) {
    console.warn('[contacts] picker failed', error)
    return { status: 'failed' }
  }
}
