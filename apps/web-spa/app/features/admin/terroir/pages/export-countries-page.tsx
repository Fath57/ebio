import type { ExportCountryAdmin, ExportCountryInput } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, Pencil, Plus, Power, PowerOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { Can } from '@/lib/casl/can'
import { CountryFormDialog } from '../forms/country-form-dialog'
import { terroirErrorMessage } from '../utils/terroir-countries'
import { countriesQueryOptions, createCountry, TERROIR_KEY, updateCountry } from '../utils/terroir-queries'

type Editing
  = | { kind: 'form', country: ExportCountryAdmin | null }
    | { kind: 'toggle', country: ExportCountryAdmin }

type SaveInput
  = | { kind: 'create', body: ExportCountryInput }
    | { kind: 'update', code: string, body: Omit<ExportCountryInput, 'code'> }
    | { kind: 'toggle', code: string, isActive: boolean }

/**
 * The countries a « Valise du pays » can travel to. Nothing is deleted: a
 * closed country takes no new order, and the parcels already on their way
 * keep their tracking.
 */
export default function ExportCountriesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useQuery(countriesQueryOptions())

  const mutation = useMutation({
    mutationFn: async (input: SaveInput) => {
      if (input.kind === 'create')
        return createCountry(input.body)
      if (input.kind === 'update')
        return updateCountry(input.code, input.body)
      return updateCountry(input.code, { isActive: input.isActive })
    },
    onMutate: () => setError(null),
    onSuccess: (saved, input) => {
      // Pickup points, departures and parcels all label countries from this list.
      queryClient.invalidateQueries({ queryKey: TERROIR_KEY })
      if (input.kind === 'toggle') {
        toast.success(input.isActive
          ? t('admin.terroir.countries.activated', { name: saved.name })
          : t('admin.terroir.countries.deactivated', { name: saved.name }))
      }
      else {
        toast.success(t('admin.terroir.countries.saved', { name: saved.name }))
      }
      setEditing(null)
    },
    onError: (failure: Error) => {
      const message = terroirErrorMessage(failure, t)
      setError(message)
      toast.error(message)
    },
  })

  const close = () => {
    setEditing(null)
    setError(null)
  }

  const nextSortOrder = data && data.length > 0 ? Math.max(...data.map(country => country.sortOrder)) + 10 : 10

  const submitForm = (country: ExportCountryAdmin | null, body: ExportCountryInput) => {
    if (!country) {
      mutation.mutate({ kind: 'create', body })
      return
    }
    const { code: _code, isActive: _isActive, ...changes } = body
    mutation.mutate({ kind: 'update', code: country.code, body: changes })
  }

  const toggled = editing?.kind === 'toggle' ? editing.country : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.terroir.countries.title')}</h2>
          <p className="text-muted-foreground">{t('admin.terroir.countries.description')}</p>
        </div>
        <Can action="manage" subject="Delivery">
          <Button onClick={() => setEditing({ kind: 'form', country: null })}>
            <Plus className="mr-1 h-4 w-4" />
            {t('admin.terroir.countries.create')}
          </Button>
        </Can>
      </div>

      <div className="bg-muted/50 flex items-start gap-3 rounded-lg border p-3 text-sm">
        <Info className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t('admin.terroir.countries.visibilityHint')}</p>
      </div>

      {isError && (
        <div className="space-y-2" role="alert">
          <p className="text-destructive">{t('admin.terroir.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
        </div>
      )}

      {isLoading && <Skeleton className="h-48 w-full" />}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">{t('admin.terroir.countries.empty')}</CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.terroir.countries.columns.country')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('admin.terroir.countries.columns.phrases')}</TableHead>
                    <TableHead>{t('admin.terroir.countries.columns.currency')}</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">{t('admin.terroir.countries.columns.sortOrder')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('admin.terroir.countries.columns.activity')}</TableHead>
                    <TableHead>{t('admin.terroir.status')}</TableHead>
                    <TableHead className="text-right"><span className="sr-only">{t('admin.terroir.actions')}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map(country => (
                    <CountryRow
                      key={country.code}
                      country={country}
                      onEdit={() => setEditing({ kind: 'form', country })}
                      onToggle={() => setEditing({ kind: 'toggle', country })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {editing?.kind === 'form' && (
        <CountryFormDialog
          country={editing.country}
          nextSortOrder={nextSortOrder}
          isPending={mutation.isPending}
          error={error}
          onClose={close}
          onSubmit={body => submitForm(editing.country, body)}
        />
      )}

      <ConfirmDialog
        open={toggled != null}
        onOpenChange={(open) => {
          if (!open)
            close()
        }}
        title={toggled?.isActive
          ? t('admin.terroir.countries.deactivateTitle', { name: toggled.name })
          : t('admin.terroir.countries.activateTitle', { name: toggled?.name ?? '' })}
        description={toggled?.isActive
          ? t('admin.terroir.countries.deactivateDescription', { count: toggled.counts.activeShipments, toPhrase: toggled.toPhrase })
          : t('admin.terroir.countries.activateDescription', { toPhrase: toggled?.toPhrase ?? '' })}
        confirmLabel={toggled?.isActive ? t('admin.terroir.countries.deactivate') : t('admin.terroir.countries.activate')}
        destructive={Boolean(toggled?.isActive)}
        isPending={mutation.isPending}
        error={error}
        onConfirm={() => {
          if (toggled)
            mutation.mutate({ kind: 'toggle', code: toggled.code, isActive: !toggled.isActive })
        }}
      />
    </div>
  )
}

interface CountryRowProps {
  country: ExportCountryAdmin
  onEdit: () => void
  onToggle: () => void
}

function CountryRow({ country, onEdit, onToggle }: CountryRowProps) {
  const { t } = useTranslation()

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="w-7 text-center text-xl leading-none" aria-hidden="true">{country.flagEmoji ?? ''}</span>
          <div className="min-w-0">
            <p className="font-medium">{country.name}</p>
            <p className="text-muted-foreground font-mono text-xs">{country.code}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <p className="text-sm">{country.toPhrase}</p>
        <p className="text-muted-foreground text-sm">{country.inPhrase}</p>
      </TableCell>
      <TableCell className="font-mono text-sm">{country.displayCurrency}</TableCell>
      <TableCell className="hidden text-right tabular-nums lg:table-cell">{country.sortOrder}</TableCell>
      <TableCell className="hidden sm:table-cell">
        <ul className="space-y-0.5 text-xs whitespace-nowrap">
          <li>{t('admin.terroir.countries.counts.pickupPoints', { count: country.counts.pickupPoints })}</li>
          <li>{t('admin.terroir.countries.counts.openDepartures', { count: country.counts.openDepartures })}</li>
          <li className="text-muted-foreground">{t('admin.terroir.countries.counts.activeShipments', { count: country.counts.activeShipments })}</li>
        </ul>
      </TableCell>
      <TableCell>
        <StatusBadge tone={country.isActive ? 'done' : 'idle'}>
          {country.isActive ? t('admin.terroir.active') : t('admin.terroir.inactive')}
        </StatusBadge>
      </TableCell>
      <TableCell className="text-right">
        <Can action="manage" subject="Delivery">
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('admin.terroir.countries.editAria', { name: country.name })}
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={country.isActive
                ? t('admin.terroir.countries.deactivateAria', { name: country.name })
                : t('admin.terroir.countries.activateAria', { name: country.name })}
              onClick={onToggle}
            >
              {country.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            </Button>
          </div>
        </Can>
      </TableCell>
    </TableRow>
  )
}
