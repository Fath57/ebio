// fr-BJ.ts — Locale Français (Bénin) pour eBio marketplace

// ---------- Brand vocabulary ----------
export const brand = {
  supplier: 'Fournisseur',
  buyer: 'Acheteur',
  verifiedBio: 'Validé eBio',
  shopProfile: 'Fiche boutique',
  itinerary: 'Itinéraire',
  order: 'Commander',
  matchmaking: 'Mise en relation',
} as const

// ---------- Common translations ----------
export const common = {
  ...brand,
  appName: 'eBio',
  loading: 'Chargement...',
  error: 'Une erreur est survenue',
  retry: 'Réessayer',
  save: 'Enregistrer',
  cancel: 'Annuler',
  delete: 'Supprimer',
  edit: 'Modifier',
  search: 'Rechercher',
  noResults: 'Aucun résultat',
  seeMore: 'Voir plus',
  back: 'Retour',
  next: 'Suivant',
  previous: 'Précédent',
  confirm: 'Confirmer',
  yes: 'Oui',
  no: 'Non',
} as const

// ---------- Number formatting ----------

const CURRENCY_CODE = 'XOF'
const LOCALE = 'fr-BJ'

/**
 * Format a number as FCFA currency.
 * Example: formatCurrency(1200) -> "1 200 FCFA"
 */
export function formatCurrency(amount: number): string {
  // Intl returns "1 200 CFA" for XOF in fr locale; we normalise to "FCFA"
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

  // Normalize the output: some runtimes produce "CFA", others "FCFA"
  return formatted.replace(/\s?CFA$/, ' FCFA').replace(/\s?F\s?CFA$/, ' FCFA')
}

/**
 * Format a plain number with French spacing.
 * Example: formatNumber(12500.5) -> "12 500,5"
 */
export function formatNumber(value: number, decimals?: number): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  }).format(value)
}

// ---------- Date / relative time formatting ----------

const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: 'long' })

const MINUTE = 60
const HOUR = 3_600
const DAY = 86_400

/**
 * Format a date as a human-readable relative string.
 * Examples: "il y a 2 h", "hier", "lun. 20 mars"
 */
export function formatRelativeDate(date: Date | string | number): string {
  const target = new Date(date)
  const now = Date.now()
  const diffSec = Math.round((target.getTime() - now) / 1_000)
  const absDiff = Math.abs(diffSec)

  if (absDiff < MINUTE) {
    return 'à l\'instant'
  }

  if (absDiff < HOUR) {
    const minutes = Math.round(diffSec / MINUTE)
    return rtf.format(minutes, 'minute')
  }

  if (absDiff < DAY) {
    const hours = Math.round(diffSec / HOUR)
    return rtf.format(hours, 'hour')
  }

  if (absDiff < DAY * 2) {
    const days = Math.round(diffSec / DAY)
    return rtf.format(days, 'day')
  }

  // Beyond 2 days: short date like "lun. 20 mars"
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(target)
}

/**
 * Format a date as a full readable string.
 * Example: "20 mars 2026"
 */
export function formatDate(date: Date | string | number): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

// ---------- Distance formatting ----------

/**
 * Format a distance in meters to a human-readable string.
 * Examples: formatDistance(350) -> "350 m", formatDistance(1200) -> "1,2 km"
 */
export function formatDistance(meters: number): string {
  if (meters < 1_000) {
    return `${Math.round(meters)} m`
  }

  const km = meters / 1_000
  return `${formatNumber(km, 1)} km`
}

// ---------- i18next resource bundle ----------

/**
 * Ready-to-use i18next resource for fr-BJ locale.
 */
export const frBJResource = {
  common,
} as const
