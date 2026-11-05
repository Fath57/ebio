/** Longest place line that still reads on the card's narrow column. */
const MAX_PLACE_LENGTH = 32

const COLLAPSE_SPACES = /\s+/g
const EMAIL = /\S+@\S+/
const PHONE = /\d[\d\s+().-]{5,}\d/
const OPEN_PARENTHESIS = /\s*\(.*$/
const HAS_LOWERCASE = /\p{Ll}/u

function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(COLLAPSE_SPACES, ' ').trim()
}

/** Shop fields are free text: an e-mail or a phone number ends up in them, and neither is a place. */
function cleanPlacePart(value: string | null | undefined): string {
  const text = normalize(value).replace(OPEN_PARENTHESIS, '').trim()
  if (!text || EMAIL.test(text) || PHONE.test(text))
    return ''
  return HAS_LOWERCASE.test(text) ? text : titleCase(text)
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())
}

/**
 * The place line of a card, from what the shop typed: « Vedoko, Cotonou ».
 * The address may repeat the neighbourhood or run far too long for the card,
 * in which case the neighbourhood alone is the better line.
 */
export function cardPlace(neighborhood: string | null | undefined, address: string | null | undefined): string {
  const hood = cleanPlacePart(neighborhood)
  const street = cleanPlacePart(address)
  if (!hood)
    return street.length <= MAX_PLACE_LENGTH ? street : (street.split(',')[0] ?? '').trim()
  if (!street || street.toLowerCase() === hood.toLowerCase())
    return hood
  if (street.toLowerCase().includes(hood.toLowerCase()))
    return street.length <= MAX_PLACE_LENGTH ? street : hood
  const both = `${hood}, ${street}`
  return both.length <= MAX_PLACE_LENGTH ? both : hood
}

/** What stands in for a missing logo: the first letters of the shop's first two words. */
export function cardInitials(name: string): string {
  return normalize(name)
    .split(' ')
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('')
}

/** A long name steps down in size; a single long word shrinks until it fits the column. */
export function nameFontSize(name: string, columnWidthPt: number): number {
  const text = normalize(name)
  const base = text.length <= 16 ? 11.5 : text.length <= 20 ? 10 : text.length <= 26 ? 9 : 8.5
  const longestWord = Math.max(...text.split(' ').map(word => word.length))
  return Math.min(base, Math.round((columnWidthPt / (0.62 * longestWord)) * 10) / 10)
}

/**
 * Breaks a text on its spaces only, so « Porto-Novo » never splits on its
 * hyphen. A word wider than the column keeps a line of its own.
 */
export function wrapLines(text: string, maxWidth: number, widthOf: (line: string) => number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of normalize(text).split(' ').filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (current && widthOf(candidate) > maxWidth) {
      lines.push(current)
      current = word
    }
    else {
      current = candidate
    }
  }
  if (current)
    lines.push(current)
  return lines
}
