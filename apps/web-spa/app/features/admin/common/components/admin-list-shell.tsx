import type { ColumnDef, OnChangeFn, SortingState } from '@boilerstone/ui/components/primitives/data-table'
import type { ReactNode } from 'react'
import { DataTable } from '@boilerstone/ui/components/primitives/data-table'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AdminListShellProps<T> {
  title: string
  description: string
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  /** Filtres additionnels (statut, rôle…) affichés à côté de la recherche. */
  filters?: ReactNode
  columns: Array<ColumnDef<T, unknown>>
  data: T[]
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  onRowClick?: (row: T) => void
  isLoading: boolean
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
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
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
  emptyLabel,
}: AdminListShellProps<T>) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            className="pl-9"
            value={searchValue}
            placeholder={searchPlaceholder}
            onChange={event => onSearchChange(event.target.value)}
          />
        </div>
        {filters}
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
        labels={{
          empty: emptyLabel,
          resultCount: count => t('dataTable.resultCount', { count }),
          pageOf: (current, lastPage) => t('dataTable.pageOf', { page: current, lastPage }),
          previous: t('dataTable.previous'),
          next: t('dataTable.next'),
        }}
      />
    </div>
  )
}
