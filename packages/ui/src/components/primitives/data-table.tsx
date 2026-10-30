import type {
  ColumnDef,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { cn } from '@boilerstone/ui/lib/utils'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Inbox,
} from 'lucide-react'
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
  error: string
  retry: string
  /** Reçoit la plage affichée et le total — ex. « 21–40 sur 312 ». */
  range: (from: number, to: number, total: number) => string
  previous: string
  next: string
  first: string
  last: string
  /** Nom accessible de la barre de pagination. */
  pagination: string
}

/**
 * Options de colonne transportées par `meta` :
 * - `align: 'right'` aligne à droite ;
 * - `numeric` aligne à droite en chiffres tabulaires et en police mono (montants) ;
 * - `className` s'applique à l'en-tête et aux cellules (largeur, troncature).
 */
export interface DataTableColumnMeta {
  align?: 'left' | 'right'
  numeric?: boolean
  className?: string
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
  /** Omitted together: the list has no server sort, headers are plain labels. */
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  onRowClick?: (row: TData) => void
  /** Premier chargement : rien à montrer encore, on dessine des lignes fantômes. */
  isLoading?: boolean
  /** Rechargement (page, tri, filtre) : les lignes précédentes restent visibles. */
  isFetching?: boolean
  isError?: boolean
  onRetry?: () => void
  /** Action proposée sous l'état vide — typiquement « Effacer les filtres ». */
  emptyAction?: ReactNode
  labels: DataTableLabels
}

const SKELETON_ROWS = 8

const NO_SORTING: SortingState = []

/** Clicks on these inside a row keep their own behaviour instead of opening the row. */
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, [role="menuitem"], [role="checkbox"]'

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
  isFetching = false,
  isError = false,
  onRetry,
  emptyAction,
  labels,
}: DataTableProps<TData>) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const clickable = Boolean(onRowClick)

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    enableSorting: Boolean(onSortingChange),
    pageCount: lastPage,
    state: {
      sorting: sorting ?? NO_SORTING,
      pagination: { pageIndex: page - 1, pageSize },
    },
    onSortingChange,
  })

  const showSkeleton = isLoading && data.length === 0
  const showError = isError && data.length === 0
  const showEmpty = !showSkeleton && !showError && data.length === 0
  const columnCount = columns.length + (clickable ? 1 : 0)

  const openRow = (row: TData, event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement
    if (target.closest(INTERACTIVE_SELECTOR))
      return
    onRowClick?.(row)
  }

  const handleRowKey = (row: TData, event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget)
      return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onRowClick?.(row)
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-card relative overflow-hidden rounded-xl border">
        {isFetching && !showSkeleton && (
          <div className="bg-primary/15 absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden" role="progressbar" aria-busy="true">
            <div className="bg-primary h-full w-1/3 animate-[data-table-progress_1s_ease-in-out_infinite]" />
          </div>
        )}
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const meta = columnMeta(header.column.columnDef)
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={canSort ? ariaSort(sorted) : undefined}
                      className={cn(
                        'h-11 px-4 text-xs font-semibold tracking-widest uppercase',
                        alignClass(meta),
                        meta?.className,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : canSort
                          ? (
                              <button
                                type="button"
                                className={cn(
                                  'hover:text-foreground focus-visible:ring-ring/50 -mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 uppercase transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
                                  sorted && 'text-foreground',
                                )}
                                onClick={header.column.getToggleSortingHandler()}
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                <SortIcon sorted={sorted} />
                              </button>
                            )
                          : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
                {clickable && <TableHead className="w-10 px-2" aria-hidden="true" />}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={cn('transition-opacity', isFetching && !showSkeleton && 'opacity-60')}>
            {showSkeleton && Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
              // eslint-disable-next-line react/no-array-index-key -- placeholder rows have no identity
              <TableRow key={rowIndex} className="hover:bg-transparent">
                {Array.from({ length: columnCount }).map((__, cellIndex) => (
                  // eslint-disable-next-line react/no-array-index-key -- placeholder cells have no identity
                  <TableCell key={cellIndex} className="px-4 py-3.5">
                    <Skeleton className={cn('h-4', cellIndex === 0 ? 'w-32' : 'w-20')} />
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {showError && (
              <StateRow colSpan={columnCount}>
                <AlertTriangle className="text-destructive h-8 w-8" />
                <p className="text-foreground font-medium">{labels.error}</p>
                {onRetry && (
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    {labels.retry}
                  </Button>
                )}
              </StateRow>
            )}

            {showEmpty && (
              <StateRow colSpan={columnCount}>
                <Inbox className="text-muted-foreground/60 h-8 w-8" />
                <p className="text-muted-foreground">{labels.empty}</p>
                {emptyAction}
              </StateRow>
            )}

            {table.getRowModel().rows.map(row => (
              <TableRow
                key={row.id}
                tabIndex={clickable ? 0 : undefined}
                className={cn(
                  'group',
                  clickable && 'focus-visible:bg-muted/50 focus-visible:ring-ring/50 cursor-pointer focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                )}
                onClick={clickable ? event => openRow(row.original, event) : undefined}
                onKeyDown={clickable ? event => handleRowKey(row.original, event) : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = columnMeta(cell.column.columnDef)
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'px-4 py-3',
                        alignClass(meta),
                        meta?.numeric && 'font-mono tabular-nums',
                        meta?.className,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
                {clickable && (
                  <TableCell className="w-10 px-2">
                    <ChevronRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <Pagination
          page={page}
          lastPage={lastPage}
          from={(page - 1) * pageSize + 1}
          to={Math.min(page * pageSize, total)}
          total={total}
          onPageChange={onPageChange}
          labels={labels}
        />
      )}
    </div>
  )
}

function StateRow({ colSpan, children }: { colSpan: number, children: ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-16">
        <div className="flex flex-col items-center justify-center gap-3 text-center whitespace-normal">
          {children}
        </div>
      </TableCell>
    </TableRow>
  )
}

interface PaginationProps {
  page: number
  lastPage: number
  from: number
  to: number
  total: number
  onPageChange: (page: number) => void
  labels: DataTableLabels
}

function Pagination({ page, lastPage, from, to, total, onPageChange, labels }: PaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm tabular-nums">{labels.range(from, to, total)}</p>
      {lastPage > 1 && (
        <nav aria-label={labels.pagination} className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={page <= 1} aria-label={labels.first} onClick={() => onPageChange(1)}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={page <= 1} aria-label={labels.previous} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageItems(page, lastPage).map((item, index) => item === 'gap'
            ? (
                // eslint-disable-next-line react/no-array-index-key -- there are at most two gaps, told apart by position
                <span key={`gap-${index}`} className="text-muted-foreground w-9 text-center text-sm">…</span>
              )
            : (
                <Button
                  key={item}
                  variant={item === page ? 'outline' : 'ghost'}
                  size="icon"
                  className={cn('h-9 w-9 tabular-nums', item === page && 'border-primary text-primary font-semibold')}
                  aria-current={item === page ? 'page' : undefined}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </Button>
              ))}
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={page >= lastPage} aria-label={labels.next} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" disabled={page >= lastPage} aria-label={labels.last} onClick={() => onPageChange(lastPage)}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  )
}

/**
 * Page numbers to show: always the first and the last, the current one and
 * its neighbours, a gap wherever pages are skipped — `1 … 4 5 6 … 16`.
 */
function pageItems(page: number, lastPage: number): Array<number | 'gap'> {
  if (lastPage <= 7)
    return Array.from({ length: lastPage }, (_, index) => index + 1)

  const start = Math.max(2, Math.min(page - 1, lastPage - 4))
  const end = Math.min(lastPage - 1, Math.max(page + 1, 5))
  const items: Array<number | 'gap'> = [1]
  if (start > 2)
    items.push('gap')
  for (let current = start; current <= end; current++)
    items.push(current)
  if (end < lastPage - 1)
    items.push('gap')
  items.push(lastPage)
  return items
}

function columnMeta(columnDef: { meta?: unknown }): DataTableColumnMeta | undefined {
  return columnDef.meta as DataTableColumnMeta | undefined
}

function alignClass(meta: DataTableColumnMeta | undefined): string | undefined {
  return meta?.align === 'right' || meta?.numeric ? 'text-right' : undefined
}

function ariaSort(sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | 'none' {
  if (!sorted)
    return 'none'
  return sorted === 'asc' ? 'ascending' : 'descending'
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted)
    return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
  return sorted === 'asc'
    ? <ArrowUp className="text-primary h-3.5 w-3.5" />
    : <ArrowDown className="text-primary h-3.5 w-3.5" />
}
