import type { ColumnDef, OnChangeFn, SortingState } from '@boilerstone/ui/components/primitives/data-table'
import type { ReactNode } from 'react'
import type { StatusTab } from './status-tabs'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDataTableLabels } from '../utils/use-data-table-labels'
import { StatusTabs } from './status-tabs'

/** Delay between the last keystroke and the request: one query per word, not per letter. */
const SEARCH_DEBOUNCE_MS = 300

export interface ActiveFilter {
  key: string
  /** What is filtered — « Statut ». */
  group: string
  /** On what — « Litige ». */
  value: string
  onRemove: () => void
}

interface AdminListShellProps<T> {
  title: string
  description: string
  /** Main actions of the page (create, export), top right. */
  actions?: ReactNode
  /** Status tabs with their counts, between the header and the toolbar. */
  statusTabs?: {
    tabs: StatusTab[]
    value: string
    onChange: (value: string) => void
    counts?: Record<string, number>
  }
  /** The three search props go together; a list the API cannot search leaves them out. */
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** Filtres additionnels (statut, rôle…) affichés à côté de la recherche. */
  filters?: ReactNode
  /** Filters in force, shown as removable chips under the toolbar. */
  activeFilters?: ActiveFilter[]
  /** Clears the search and every filter at once. */
  onResetFilters?: () => void
  columns: Array<ColumnDef<T, unknown>>
  data: T[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  onRowClick?: (row: T) => void
  isLoading: boolean
  isFetching?: boolean
  isError?: boolean
  onRetry?: () => void
  emptyLabel: string
}

/**
 * Ossature des listes du back-office : en-tête, recherche, filtres, puis une
 * `DataTable` dont la pagination et le tri sont résolus côté serveur. Les
 * libellés génériques du tableau sont traduits ici, une seule fois.
 */
export function AdminListShell<T>({
  title,
  description,
  actions,
  statusTabs,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = '',
  filters,
  activeFilters = [],
  onResetFilters,
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  sorting,
  onSortingChange,
  onRowClick,
  isLoading,
  isFetching = false,
  isError = false,
  onRetry,
  emptyLabel,
}: AdminListShellProps<T>) {
  const { t } = useTranslation()
  const labels = useDataTableLabels(emptyLabel)
  const isFiltered = searchValue !== '' || activeFilters.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {statusTabs && <StatusTabs {...statusTabs} />}

      <div className="space-y-3">
        {(onSearchChange || filters) && (
          <div className="flex flex-wrap items-center gap-3">
            {onSearchChange && (
              <SearchField
                value={searchValue}
                onChange={onSearchChange}
                placeholder={searchPlaceholder}
              />
            )}
            {filters}
          </div>
        )}

        {activeFilters.length > 0 && onResetFilters && (
          <div className="flex flex-wrap items-center gap-2" aria-label={t('dataTable.activeFilters')}>
            {activeFilters.map(filter => (
              <span
                key={filter.key}
                className="border-primary/30 bg-primary/5 inline-flex h-8 items-center gap-1.5 rounded-full border pr-1 pl-3 text-sm"
              >
                <span className="text-muted-foreground">{filter.group}</span>
                <span className="font-medium">{filter.value}</span>
                <button
                  type="button"
                  className="hover:bg-primary/10 focus-visible:ring-ring/50 rounded-full p-1 focus-visible:ring-2 focus-visible:outline-none"
                  aria-label={t('dataTable.removeFilter', { filter: `${filter.group} ${filter.value}` })}
                  onClick={filter.onRemove}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            <Button variant="link" size="sm" className="h-8 px-2" onClick={onResetFilters}>
              {t('dataTable.resetAll')}
            </Button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        sorting={sorting}
        onSortingChange={onSortingChange}
        onRowClick={onRowClick}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        onRetry={onRetry}
        emptyAction={isFiltered && onResetFilters
          ? (
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                {t('dataTable.clearFilters')}
              </Button>
            )
          : undefined}
        labels={labels}
      />
    </div>
  )
}

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
}

/**
 * Typing stays local and instant; the parent only hears about it once the
 * keyboard pauses. A value changed from outside (reset, back navigation)
 * overwrites the draft.
 */
function SearchField({ value, onChange, placeholder }: SearchFieldProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === value)
      return
    const timer = setTimeout(() => onChangeRef.current(draft), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, value])

  const clear = () => {
    setDraft('')
    onChange('')
  }

  return (
    <div className="relative w-full lg:w-auto lg:min-w-96 lg:flex-1">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
      <Input
        type="search"
        className="h-10 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && draft)
            clear()
        }}
      />
      {draft && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 focus-visible:ring-2 focus-visible:outline-none"
          aria-label={t('dataTable.clearSearch')}
          onClick={clear}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
