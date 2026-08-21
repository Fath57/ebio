/**
 * FedaPay payout `mode` derived from the Benin 10-digit numbering plan
 * (prefixes as deployed in the ntech POS project, 2024 plan).
 */
const OPERATOR_PREFIXES: Record<string, string[]> = {
  mtn_open: ['0142', '0146', '0150', '0151', '0152', '0153', '0154', '0156', '0157', '0159', '0161', '0162', '0166', '0167', '0169', '0190', '0191', '0192', '0193', '0196', '0197'],
  moov: ['0145', '0155', '0158', '0160', '0163', '0164', '0165', '0168', '0194', '0195', '0198', '0199'],
  sbin: ['0140', '0141', '0143', '0144', '0147', '0148', '0149'],
}

export const OPERATOR_LABELS: Record<string, string> = {
  mtn_open: 'MTN Bénin',
  moov: 'Moov Africa Bénin',
  sbin: 'Celtiis Bénin',
}

/** Local 10-digit form (01XXXXXXXX) whatever the input format. */
export function normalizeBeninPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('229'))
    return digits.slice(3)
  return digits
}

/** Returns the FedaPay mode (mtn_open | moov | sbin) or null if unroutable. */
export function detectOperator(phone: string): string | null {
  const local = normalizeBeninPhone(phone)
  if (local.length !== 10)
    return null
  const prefix = local.slice(0, 4)
  for (const [code, prefixes] of Object.entries(OPERATOR_PREFIXES)) {
    if (prefixes.includes(prefix))
      return code
  }
  return null
}
