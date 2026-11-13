import { getCalendars } from 'expo-localization'

/**
 * Time zones a phone in Benin may report. Many Beninese phones are set to a
 * neighbouring UTC+1 zone (Lagos, Douala…), so every West/Central African
 * UTC+1 zone counts as "home".
 */
const HOME_TIME_ZONES = new Set([
  'Africa/Porto-Novo',
  'Africa/Lagos',
  'Africa/Douala',
  'Africa/Kinshasa',
  'Africa/Malabo',
  'Africa/Libreville',
  'Africa/Niamey',
  'Africa/Ndjamena',
  'Africa/Bangui',
  'Africa/Brazzaville',
  'Africa/Luanda',
])

/** The device's IANA time zone, or null when it cannot be read. */
export function deviceTimeZone(): string | null {
  try {
    const timeZone = getCalendars()[0]?.timeZone
    return timeZone && timeZone.length > 0 ? timeZone : null
  }
  catch {
    return null
  }
}

/**
 * Whether the device seems to be outside Benin, judged by its time zone —
 * no permission needed, unlike the GPS. An unreadable zone counts as home:
 * the screens then keep today's phone-first flow.
 */
export function isAbroad(): boolean {
  const timeZone = deviceTimeZone()
  if (!timeZone)
    return false
  return !HOME_TIME_ZONES.has(timeZone)
}
