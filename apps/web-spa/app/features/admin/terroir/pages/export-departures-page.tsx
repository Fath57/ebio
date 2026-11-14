import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { ExportDeparture, ExportDepartureInput, ExportDepartureStatus } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { Can } from '@/lib/casl/can'
import { CancelDepartureDialog } from '../components/cancel-departure-dialog'
import { FillGauge } from '../components/fill-gauge'
import { DepartureStatusBadge } from '../components/terroir-status-badges'
import { DepartureFormDialog } from '../forms/departure-form-dialog'
import { terroirErrorMessage, useExportCountries } from '../utils/terroir-countries'
import { formatDateTime, formatDay, formatDayShort, formatKg } from '../utils/terroir-format'
import { agenciesQueryOptions, cancelDeparture, departuresQueryOptions, saveDeparture, TERROIR_KEY } from '../utils/terroir-queries'
import { DEPARTURE_STATUSES } from '../utils/terroir-types'

type Editing
  = | { kind: 'form', departure: ExportDeparture | null }
    | { kind: 'cancel', departure: ExportDeparture }

type DepartureSave = ExportDepartureInput & { status?: Exclude<ExportDepartureStatus, 'CANCELLED'> }

function isStatus(value: string): value is ExportDepartureStatus {
  return (DEPARTURE_STATUSES as readonly string[]).includes(value)
}

/**
 * Every departure of the partner agencies: when it leaves, how full it is,
 * what a kilo costs per country. A row opens the departure with its parcels
 * and the collection list.
 */
export default function ExportDeparturesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusTab, setStatusTab] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = isStatus(statusTab) ? statusTab : undefined

  const departures = useQuery(departuresQueryOptions(status))
  const openDepartures = useQuery(departuresQueryOptions('OPEN'))
  const agencies = useQuery(agenciesQueryOptions())
  const countries = useExportCountries()
  const countryLabelOf = countries.labelOf

  const close = () => {
    setEditing(null)
    setError(null)
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null, input: DepartureSave }) => {
      const { status: nextStatus, ...fields } = input
      return saveDeparture(id, fields, nextStatus)
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TERROIR_KEY })
      toast.success(t('admin.terroir.departures.saved'))
      close()
    },
    onError: (failure: Error) => setError(terroirErrorMessage(failure, t)),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reassignTo }: { id: string, reassignTo: string | null }) => cancelDeparture(id, reassignTo),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: TERROIR_KEY })
      toast.success(result.reassigned > 0
        ? t('admin.terroir.departures.cancelledReassigned', { count: result.reassigned, surcharge: formatAmount(result.surcharge) })
        : t('admin.terroir.departures.cancelled'))
      close()
    },
    onError: (failure: Error) => setError(terroirErrorMessage(failure, t)),
  })

  const columns = useMemo<Array<ColumnDef<ExportDeparture, unknown>>>(() => [
    {
      id: 'departsOn',
      header: t('admin.terroir.departures.columns.departsOn'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium whitespace-nowrap">{formatDay(row.original.departsOn)}</p>
          <p className="text-muted-foreground text-xs">{row.original.agency.name}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('admin.terroir.status'),
      cell: ({ row }) => <DepartureStatusBadge status={row.original.status} />,
    },
    {
      id: 'deadlines',
      header: t('admin.terroir.departures.columns.deadlines'),
      meta: { hideBelow: 'md' },
      cell: ({ row }) => (
        <div className="space-y-0.5 text-xs">
          <p>{t('admin.terroir.departures.orderBefore', { date: formatDateTime(row.original.orderBefore) })}</p>
          <p className="text-muted-foreground">{t('admin.terroir.departures.depositBefore', { date: formatDateTime(row.original.depositDeadline) })}</p>
          <p className="text-muted-foreground">{t('admin.terroir.departures.arrivalRange', { from: formatDayShort(row.original.arrival.from), to: formatDayShort(row.original.arrival.to) })}</p>
        </div>
      ),
    },
    {
      id: 'rates',
      header: t('admin.terroir.departures.columns.rates'),
      meta: { hideBelow: 'lg' },
      cell: ({ row }) => (
        <div className="space-y-0.5 text-xs">
          {row.original.rates.map(rate => (
            <p key={rate.country} className="whitespace-nowrap">
              <span className="font-medium">{countryLabelOf(rate.country)}</span>
              {' '}
              {t('admin.terroir.departures.ratePerKg', { price: formatAmount(rate.pricePerKg), min: formatKg(rate.minBilledKg) })}
            </p>
          ))}
        </div>
      ),
    },
    {
      id: 'fill',
      header: t('admin.terroir.departures.columns.fill'),
      cell: ({ row }) => <FillGauge fill={row.original.fill} />,
    },
    {
      id: 'shipments',
      header: t('admin.terroir.departures.columns.shipments'),
      meta: { numeric: true, hideBelow: 'md' },
      cell: ({ row }) => row.original.shipmentCount.toLocaleString('fr-FR'),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const departure = row.original
        if (departure.status === 'CANCELLED')
          return null
        return (
          <Can action="manage" subject="Delivery">
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('admin.terroir.departures.editAria', { date: formatDay(departure.departsOn) })}
                onClick={(event) => {
                  event.stopPropagation()
                  setEditing({ kind: 'form', departure })
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {departure.status !== 'DEPARTED' && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('admin.terroir.departures.cancelAria', { date: formatDay(departure.departsOn) })}
                  onClick={(event) => {
                    event.stopPropagation()
                    setEditing({ kind: 'cancel', departure })
                  }}
                >
                  <Ban className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Can>
        )
      },
    },
  ], [t, countryLabelOf])

  const rows = departures.data ?? []

  return (
    <>
      <AdminListShell
        title={t('admin.terroir.departures.title')}
        description={t('admin.terroir.departures.description')}
        actions={(
          <Can action="manage" subject="Delivery">
            <Button onClick={() => setEditing({ kind: 'form', departure: null })}>
              <Plus className="mr-1 h-4 w-4" />
              {t('admin.terroir.departures.create')}
            </Button>
          </Can>
        )}
        statusTabs={{
          tabs: DEPARTURE_STATUSES.map(value => ({
            value,
            label: t(`admin.terroir.departureStatus.${value}`),
            tone: value === 'FULL' ? 'action' : undefined,
          })),
          value: statusTab,
          onChange: setStatusTab,
        }}
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        onPageChange={() => {}}
        onRowClick={departure => navigate(`/admin/terroir/departs/${departure.id}`)}
        isLoading={departures.isLoading}
        isFetching={departures.isFetching}
        isError={departures.isError}
        onRetry={() => departures.refetch()}
        emptyLabel={t('admin.terroir.departures.empty')}
      />

      {editing?.kind === 'form' && (
        <DepartureFormDialog
          departure={editing.departure}
          agencies={agencies.data ?? []}
          countries={countries.isError ? [] : countries.data}
          isPending={saveMutation.isPending}
          error={error}
          onClose={close}
          onSubmit={input => saveMutation.mutate({ id: editing.departure?.id ?? null, input })}
        />
      )}
      {editing?.kind === 'cancel' && (
        <CancelDepartureDialog
          departure={editing.departure}
          targets={(openDepartures.data ?? []).filter(item => item.id !== editing.departure.id)}
          isPending={cancelMutation.isPending}
          error={error}
          onClose={close}
          onConfirm={reassignTo => cancelMutation.mutate({ id: editing.departure.id, reassignTo })}
        />
      )}
    </>
  )
}
