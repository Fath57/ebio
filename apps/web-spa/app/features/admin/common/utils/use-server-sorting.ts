import type { SortingState } from '@boilerstone/ui/components/primitives/data-table'
import { useCallback, useState } from 'react'

interface ServerSorting {
  /** État au format TanStack, passé tel quel à la `DataTable`. */
  sorting: SortingState
  setSorting: (updater: SortingState | ((old: SortingState) => SortingState)) => void
  /** Traduction pour l'API. */
  sortBy: string
  sortDir: 'asc' | 'desc'
}

/**
 * Fait le pont entre l'état de tri de TanStack (`[{ id, desc }]`) et les
 * paramètres attendus par l'API (`sortBy` / `sortDir`). Un tri vidé retombe sur
 * la colonne par défaut, pour que la requête reste déterministe.
 */
export function useServerSorting(defaultColumn: string, onChange?: () => void): ServerSorting {
  const [sorting, setSortingState] = useState<SortingState>([
    { id: defaultColumn, desc: true },
  ])

  const setSorting = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      setSortingState(old => (typeof updater === 'function' ? updater(old) : updater))
      onChange?.()
    },
    [onChange],
  )

  const active = sorting[0]

  return {
    sorting,
    setSorting,
    sortBy: active?.id ?? defaultColumn,
    sortDir: active ? (active.desc ? 'desc' : 'asc') : 'desc',
  }
}
