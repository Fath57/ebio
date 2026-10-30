/** How many rows of a list sit in each status, for the tabs above it. */
export type StatusCounts = Record<string, number>

/**
 * Folds `SELECT <status> AS status, COUNT(*) AS count … GROUP BY <status>`
 * rows into a map. Postgres returns COUNT as a string (bigint), and a status
 * with no row is simply absent: the client reads a missing key as 0.
 */
export function toStatusCounts(rows: ReadonlyArray<{ status: unknown, count: unknown }>): StatusCounts {
  const counts: StatusCounts = {}
  for (const row of rows) {
    if (typeof row.status !== 'string' || row.status === '')
      continue
    counts[row.status] = (counts[row.status] ?? 0) + Number(row.count ?? 0)
  }
  return counts
}
