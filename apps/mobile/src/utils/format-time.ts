/** Formats an ISO date as a `HH:MM` clock time (fr-FR locale). */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** True when the ISO date is strictly in the future (null-safe). */
export function isFutureIso(iso: string | null | undefined): iso is string {
  if (!iso)
    return false
  return new Date(iso).getTime() > Date.now()
}
