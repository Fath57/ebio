/**
 * Extracts a human-readable message from a failed API response, falling back
 * to a generic one. Nzoth validation errors carry `aggregateErrors`.
 */
export async function readApiError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string, aggregateErrors?: Array<{ message?: string }> } | null
  return body?.aggregateErrors?.[0]?.message ?? body?.message ?? 'Une erreur est survenue'
}
