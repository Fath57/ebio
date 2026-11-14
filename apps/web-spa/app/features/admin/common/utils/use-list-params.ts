import type { OnChangeFn, SortingState } from '@boilerstone/ui/components/primitives/data-table'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

interface ListParamsOptions<F extends string> {
  /** Column sorted on when the URL says nothing, always descending. */
  defaultSort: string
  /** URL keys of the page's own filters (`statut`, `role`…). */
  filters?: readonly F[]
  /**
   * Value a filter takes when the URL leaves it out, a to-do list opens on
   * what is waiting. Choosing "all" then writes the key empty (`?statut=`),
   * the only way to say "no filter" when the default is one.
   */
  defaults?: Partial<Record<F, string>>
}

export interface ListParams<F extends string> {
  q: string
  page: number
  sortBy: string
  sortDir: 'asc' | 'desc'
  /** TanStack shape, handed to the `DataTable` as is. */
  sorting: SortingState
  setSorting: OnChangeFn<SortingState>
  /** Filter values, `''` when unset. */
  values: Record<F, string>
  setSearch: (value: string) => void
  setPage: (page: number) => void
  setFilter: (key: F, value: string) => void
  /** Several keys in one history entry, a shop picker sets its id and its name together. */
  setFilters: (changes: Partial<Record<F, string>>) => void
  /** Clears the search and every filter; the sort stays. */
  reset: () => void
  /** True when the search or any filter narrows the list. */
  isFiltered: boolean
}

/**
 * A back-office list keeps its search, filters, page and sort in the URL.
 *
 * Opening a row and coming back lands on the very same view, a filtered list
 * can be linked to (the dashboard's to-do cards do), and a reload loses
 * nothing. Writes replace the history entry: paging through a list must not
 * turn the back button into an undo of every click.
 *
 * Any change other than paging sends the list back to page 1.
 */
export function useListParams<F extends string = never>({
  defaultSort,
  filters = [],
  defaults,
}: ListParamsOptions<F>): ListParams<F> {
  const [params, setParams] = useSearchParams()

  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const sortBy = params.get('tri') ?? defaultSort
  const sortDir = params.get('sens') === 'asc' ? 'asc' : 'desc'

  const filterKey = filters.join(',')
  const defaultKey = JSON.stringify(defaults ?? {})
  const defaultValues = useMemo(() => JSON.parse(defaultKey) as Partial<Record<string, string>>, [defaultKey])

  const values = useMemo(() => {
    const result = {} as Record<F, string>
    for (const key of filterKey.split(',').filter(Boolean) as F[])
      result[key] = params.get(key) ?? defaultValues[key] ?? ''
    return result
  }, [params, filterKey, defaultValues])

  /** `null` removes the key; a string, even empty, is written as is. */
  const update = useCallback((changes: Record<string, string | null>, keepPage = false) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null)
          next.delete(key)
        else
          next.set(key, value)
      }
      if (!keepPage)
        next.delete('page')
      return next
    }, { replace: true })
  }, [setParams])

  const sorting = useMemo<SortingState>(() => [{ id: sortBy, desc: sortDir === 'desc' }], [sortBy, sortDir])

  const setSorting = useCallback<OnChangeFn<SortingState>>((updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const active = next[0]
    // A cleared sort falls back to the default column, so the query stays deterministic.
    update({
      tri: active && active.id !== defaultSort ? active.id : null,
      sens: active && !active.desc ? 'asc' : null,
    })
  }, [sorting, update, defaultSort])

  /** The URL form of a filter value: a default needs no key, "all" over a default needs an empty one. */
  const toParam = useCallback((key: string, value: string): string | null => {
    const fallback = defaultValues[key] ?? ''
    if (value === fallback)
      return null
    return value
  }, [defaultValues])

  const setFilters = useCallback((changes: Partial<Record<F, string>>) => {
    const raw: Record<string, string | null> = {}
    for (const [key, value] of Object.entries<string | undefined>(changes))
      raw[key] = toParam(key, value ?? '')
    update(raw)
  }, [update, toParam])

  const reset = useCallback(() => {
    const cleared: Record<string, string | null> = { q: null }
    for (const key of filterKey.split(',').filter(Boolean))
      cleared[key] = toParam(key, '')
    update(cleared)
  }, [update, filterKey, toParam])

  return {
    q,
    page,
    sortBy,
    sortDir,
    sorting,
    setSorting,
    values,
    setSearch: useCallback((value: string) => update({ q: value.trim() ? value : null }), [update]),
    setPage: useCallback((next: number) => update({ page: next > 1 ? String(next) : null }, true), [update]),
    setFilter: useCallback((key: F, value: string) => update({ [key]: toParam(key, value) }), [update, toParam]),
    setFilters,
    reset,
    isFiltered: q !== '' || Object.values<string>(values).some(Boolean),
  }
}
