import type {
  ColumnDef,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Button } from './button'
import { Skeleton } from './skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'

export type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table'

export interface DataTableLabels {
  empty: string
  /** Reçoit `total` — ex. « 42 résultats ». */
  resultCount: (total: number) => string
  /** Reçoit la page courante et la dernière — ex. « Page 2 / 5 ». */
  pageOf: (page: number, lastPage: number) => string
  previous: string
  next: string
}

export interface DataTableProps<TData> {
  columns: Array<ColumnDef<TData, unknown>>
  data: TData[]
  /** Total renvoyé par le serveur, pas la longueur de `data`. */
  total: number
  /** Page courante, en base 1 — l'API pagine à partir de 1. */
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  onRowClick?: (row: TData) => void
  isLoading?: boolean
  labels: DataTableLabels
}

/**
 * Tableau dont la pagination et le tri sont **résolus par le serveur**
 * (`manualPagination` / `manualSorting`) : TanStack ne réordonne ni ne découpe
 * les lignes, il gère l'état et le rendu, la source de vérité reste l'API.
 *
 * Aucune chaîne n'est codée en dur : les libellés arrivent par `labels`, pour
 * que le paquet reste indépendant de la solution d'i18n de l'application.
 */
export function DataTable<TData>({
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  sorting,
  onSortingChange,
  onRowClick,
  isLoading = false,
  labels,
}: DataTableProps<TData>) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: lastPage,
    state: {
      sorting,
      pagination: { pageIndex: page - 1, pageSize },
    },
    onSortingChange,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-8 text-center">
        {labels.empty}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id} className={alignClass(header.column.columnDef)}>
                      {header.isPlaceholder
                        ? null
                        : canSort
                          ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="-ml-3 h-8"
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                <SortIcon sorted={sorted} />
                              </Button>
                            )
                          : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map(row => (
              <TableRow
                key={row.id}
                className={onRowClick ? 'cursor-pointer' : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id} className={alignClass(cell.column.columnDef)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{labels.resultCount(total)}</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {labels.previous}
          </Button>
          <span className="text-muted-foreground text-sm">{labels.pageOf(page, lastPage)}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
          >
            {labels.next}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Alignement transporté par `meta.align` sur la définition de colonne. */
function alignClass(columnDef: { meta?: unknown }): string | undefined {
  const meta = columnDef.meta as { align?: 'left' | 'right' } | undefined
  return meta?.align === 'right' ? 'text-right' : undefined
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted)
    return <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-40" />
  return sorted === 'asc'
    ? <ArrowUp className="ml-2 h-3.5 w-3.5" />
    : <ArrowDown className="ml-2 h-3.5 w-3.5" />
}
