/**
 * Source unique de vérité pour l'interprétation des horaires d'ouverture.
 *
 * Le format canonique, celui du contrat `openingHoursSchema` et de l'éditeur
 * mobile, est un enregistrement par jour en anglais :
 *
 *   { monday: { open: 'HH:MM', close: 'HH:MM', closed?: true }, ... }
 *
 * Un jour absent, `null`, ou marqué `closed` vaut fermé. Une liste de créneaux
 * est acceptée pour les journées coupées : `{ monday: [{...}, {...}] }`.
 */

/** Jours dans l'ordre de `Date.getDay()` — dimanche = 0. */
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

/**
 * Fuseau d'évaluation par défaut. Les horaires sont stockés en heure locale du
 * commerce sans fuseau : sans point de référence, un serveur hébergé ailleurs
 * qu'au Bénin déclarerait les boutiques ouvertes au mauvais moment.
 */
const DEFAULT_TIMEZONE = 'Africa/Porto-Novo'

interface DaySlot {
  open?: string
  close?: string
  closed?: boolean
}

export type OpeningHours = Record<string, DaySlot | DaySlot[] | null> | null

/** Jour et heure locale (`HH:MM`) dans le fuseau donné. */
function localDayAndTime(now: Date, timeZone: string): { dayKey: string, time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const lookup = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const weekday = lookup('weekday').toLowerCase()
  const dayKey = DAY_KEYS.find(d => d.startsWith(weekday)) ?? DAY_KEYS[now.getDay()]
  // `hour12: false` peut rendre « 24 » à minuit selon la plateforme.
  const hour = lookup('hour') === '24' ? '00' : lookup('hour')

  return { dayKey, time: `${hour}:${lookup('minute')}` }
}

function isWithinSlot(slot: DaySlot, time: string): boolean {
  if (slot.closed || !slot.open || !slot.close)
    return false

  // Créneau à cheval sur minuit (22:00 → 02:00) : deux intervalles disjoints.
  if (slot.close < slot.open)
    return time >= slot.open || time <= slot.close

  return time >= slot.open && time <= slot.close
}

/**
 * Indique si le commerce est ouvert à l'instant donné.
 *
 * @param openingHours Horaires du commerce, au format canonique.
 * @param now Instant d'évaluation.
 * @param timeZone Fuseau du commerce (colonne `suppliers.timezone`).
 */
export function isOpenNow(
  openingHours: OpeningHours,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  if (!openingHours)
    return false

  const { dayKey, time } = localDayAndTime(now, timeZone)
  const daySchedule = openingHours[dayKey]
  if (!daySchedule)
    return false

  const slots = Array.isArray(daySchedule) ? daySchedule : [daySchedule]
  return slots.some(slot => typeof slot === 'object' && slot !== null && isWithinSlot(slot, time))
}

const DAY_LABELS: Record<string, string> = {
  sunday: 'dimanche',
  monday: 'lundi',
  tuesday: 'mardi',
  wednesday: 'mercredi',
  thursday: 'jeudi',
  friday: 'vendredi',
  saturday: 'samedi',
}

/**
 * When the shop opens again, phrased for the buyer.
 *
 * "Closed" on its own leaves them guessing whether that means an hour or a
 * week. Giving the reopening time is the difference between an order placed
 * in full knowledge and an order abandoned.
 *
 * Returns `null` when no hours are recorded, or when no opening falls within
 * seven days: we do not promise a reopening the schedule cannot back.
 */
export function nextOpening(
  openingHours: OpeningHours,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): string | null {
  if (!openingHours)
    return null

  const { dayKey, time } = localDayAndTime(now, timeZone)
  const todayIndex = DAY_KEYS.indexOf(dayKey as typeof DAY_KEYS[number])
  if (todayIndex < 0)
    return null

  for (let ahead = 0; ahead < 7; ahead += 1) {
    const key = DAY_KEYS[(todayIndex + ahead) % DAY_KEYS.length]
    const daySchedule = openingHours[key]
    if (!daySchedule)
      continue

    const slots = (Array.isArray(daySchedule) ? daySchedule : [daySchedule])
      .filter((slot): slot is DaySlot => typeof slot === 'object' && slot !== null && slot.closed !== true)
      .map(slot => slot.open)
      .filter((open): open is string => typeof open === 'string')
      .sort()

    // Today, only the openings still ahead count.
    const opening = ahead === 0 ? slots.find(open => open > time) : slots[0]
    if (!opening)
      continue

    if (ahead === 0)
      return `aujourd'hui à ${opening}`
    if (ahead === 1)
      return `demain à ${opening}`
    return `${DAY_LABELS[key] ?? key} à ${opening}`
  }

  return null
}
