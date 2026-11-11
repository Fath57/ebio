import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Application from 'expo-application'
import { Platform } from 'react-native'

const PENDING_KEY = 'referral:pending-code'
const INSTALL_REFERRER_READ_KEY = 'referral:install-referrer-read'

/** Same shape the API accepts: letters and digits, 4 to 16 of them. */
const CODE_PATTERN = /^[A-Z0-9]{4,16}$/
/** `ebio_ref=ABC234` inside the Play Store referrer string. */
const INSTALL_REFERRER_CODE = /(?:^|&)ebio_ref=([A-Z0-9]{4,16})(?:&|$)/i

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase()
  return CODE_PATTERN.test(code) ? code : null
}

/**
 * A sponsor's code waiting for an account to land on. It comes from the sign-up
 * field, a shared `/parrainage/CODE` link, or the Play Store install itself, and
 * is claimed as soon as someone is signed in — whichever way they signed up.
 */
export async function getPendingReferralCode(): Promise<string | null> {
  try {
    return normalizeReferralCode(await AsyncStorage.getItem(PENDING_KEY))
  }
  catch {
    return null
  }
}

export async function setPendingReferralCode(raw: string | null | undefined): Promise<void> {
  const code = normalizeReferralCode(raw)
  if (!code)
    return
  try {
    await AsyncStorage.setItem(PENDING_KEY, code)
  }
  catch {
    // Storage unavailable: the code can still be typed on the referral screen.
  }
}

export async function clearPendingReferralCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY)
  }
  catch {
    // Nothing to clear.
  }
}

/**
 * Android only: the Play Store hands over the `referrer` of the link that led
 * to the install (`…/details?id=com.ebio.mobile&referrer=ebio_ref%3DABC234`).
 * Read once per install — an older code must not come back after a sign-out.
 * A link-provided code already waiting wins over it.
 */
export async function captureInstallReferrer(): Promise<void> {
  if (Platform.OS !== 'android')
    return
  try {
    if (await AsyncStorage.getItem(INSTALL_REFERRER_READ_KEY))
      return
    await AsyncStorage.setItem(INSTALL_REFERRER_READ_KEY, '1')
    const referrer = decodeURIComponent(await Application.getInstallReferrerAsync())
    const code = normalizeReferralCode(INSTALL_REFERRER_CODE.exec(referrer)?.[1])
    if (code && !(await getPendingReferralCode()))
      await setPendingReferralCode(code)
  }
  catch {
    // Sideloaded build or Play services missing: no referrer to read.
  }
}
