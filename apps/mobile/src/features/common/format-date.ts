/**
 * Relative French date, the form the brand rules ask for: « il y a 2 h »,
 * « hier », « 20 mars » — never an ISO timestamp on screen.
 *
 * Lifted out of `reviews-list.tsx`, where it was a local function, so the
 * product reviews show their dates exactly like the shop ones.
 */
export function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) {
    return 'il y a quelques minutes'
  }
  if (hours < 24) {
    return `il y a ${hours} h`
  }
  const days = Math.floor(hours / 24)
  if (days === 1) {
    return 'hier'
  }
  if (days < 30) {
    return `il y a ${days} jours`
  }
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
