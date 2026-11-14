import type { ExportAgency, ExportAgencyInput, ExportPickupPoint, ExportPickupPointInput } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { Can } from '@/lib/casl/can'
import { AgencyFormDialog } from '../forms/agency-form-dialog'
import { PickupPointFormDialog } from '../forms/pickup-point-form-dialog'
import { terroirErrorMessage, useExportCountries } from '../utils/terroir-countries'
import { agenciesQueryOptions, saveAgency, savePickupPoint, terroirKeys } from '../utils/terroir-queries'

type Editing
  = | { kind: 'agency', agency: ExportAgency | null }
    | { kind: 'point', agency: ExportAgency, point: ExportPickupPoint | null }

type SaveInput
  = | { kind: 'agency', id: string | null, body: ExportAgencyInput }
    | { kind: 'point', agencyId: string, id: string | null, body: ExportPickupPointInput }

/**
 * The partner agencies that carry parcels abroad, and the points where
 * buyers collect them. Inactive ones stay listed for the
 * departures that quote them.
 */
export default function ExportAgenciesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useQuery(agenciesQueryOptions())
  const { countries, labelOf } = useExportCountries()

  const mutation = useMutation({
    mutationFn: async (input: SaveInput) => {
      if (input.kind === 'agency')
        return saveAgency(input.id, input.body)
      return savePickupPoint(input.agencyId, input.id, input.body)
    },
    onMutate: () => setError(null),
    onSuccess: (_saved, input) => {
      queryClient.invalidateQueries({ queryKey: terroirKeys.agencies })
      // A pickup point changes the country's counts.
      queryClient.invalidateQueries({ queryKey: terroirKeys.countries })
      toast.success(input.kind === 'agency' ? t('admin.terroir.agencies.saved') : t('admin.terroir.pickupPoints.saved'))
      setEditing(null)
    },
    onError: (failure: Error) => setError(terroirErrorMessage(failure, t)),
  })

  const close = () => {
    setEditing(null)
    setError(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.terroir.agencies.title')}</h2>
          <p className="text-muted-foreground">{t('admin.terroir.agencies.description')}</p>
        </div>
        <Can action="manage" subject="Delivery">
          <Button onClick={() => setEditing({ kind: 'agency', agency: null })}>
            <Plus className="mr-1 h-4 w-4" />
            {t('admin.terroir.agencies.create')}
          </Button>
        </Can>
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
          <CardContent className="text-muted-foreground py-10 text-center">{t('admin.terroir.agencies.empty')}</CardContent>
        </Card>
      )}

      {data?.map(agency => (
        <AgencyCard
          key={agency.id}
          agency={agency}
          countryLabel={labelOf}
          onEdit={() => setEditing({ kind: 'agency', agency })}
          onAddPoint={() => setEditing({ kind: 'point', agency, point: null })}
          onEditPoint={point => setEditing({ kind: 'point', agency, point })}
        />
      ))}

      {editing?.kind === 'agency' && (
        <AgencyFormDialog
          agency={editing.agency}
          isPending={mutation.isPending}
          error={error}
          onClose={close}
          onSubmit={body => mutation.mutate({ kind: 'agency', id: editing.agency?.id ?? null, body })}
        />
      )}
      {editing?.kind === 'point' && (
        <PickupPointFormDialog
          agencyName={editing.agency.name}
          countries={countries}
          point={editing.point}
          isPending={mutation.isPending}
          error={error}
          onClose={close}
          onSubmit={body => mutation.mutate({ kind: 'point', agencyId: editing.agency.id, id: editing.point?.id ?? null, body })}
        />
      )}
    </div>
  )
}

interface AgencyCardProps {
  agency: ExportAgency
  countryLabel: (code: string) => string
  onEdit: () => void
  onAddPoint: () => void
  onEditPoint: (point: ExportPickupPoint) => void
}

function AgencyCard({ agency, countryLabel, onEdit, onAddPoint, onEditPoint }: AgencyCardProps) {
  const { t } = useTranslation()
  const contact = [agency.contactName, agency.contactPhone, agency.contactEmail].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{agency.name}</CardTitle>
            <StatusBadge tone={agency.active ? 'done' : 'idle'}>
              {agency.active ? t('admin.terroir.active') : t('admin.terroir.inactive')}
            </StatusBadge>
          </div>
          <p className="text-muted-foreground text-sm">{contact || t('admin.terroir.agencies.noContact')}</p>
          {agency.notes && <p className="text-sm whitespace-pre-line">{agency.notes}</p>}
        </div>
        <Can action="manage" subject="Delivery">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1 h-4 w-4" />
              {t('common.edit')}
            </Button>
            <Button variant="outline" size="sm" onClick={onAddPoint}>
              <MapPin className="mr-1 h-4 w-4" />
              {t('admin.terroir.pickupPoints.create')}
            </Button>
          </div>
        </Can>
      </CardHeader>
      <CardContent>
        {agency.pickupPoints.length === 0
          ? <p className="text-muted-foreground text-sm">{t('admin.terroir.pickupPoints.empty')}</p>
          : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.terroir.pickupPoints.fields.country')}</TableHead>
                      <TableHead>{t('admin.terroir.pickupPoints.fields.city')}</TableHead>
                      <TableHead>{t('admin.terroir.pickupPoints.fields.address')}</TableHead>
                      <TableHead>{t('admin.terroir.pickupPoints.fields.openingHours')}</TableHead>
                      <TableHead>{t('admin.terroir.status')}</TableHead>
                      <TableHead className="text-right"><span className="sr-only">{t('admin.terroir.actions')}</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agency.pickupPoints.map(point => (
                      <TableRow key={point.id}>
                        <TableCell>{countryLabel(point.country)}</TableCell>
                        <TableCell className="font-medium">{point.city}</TableCell>
                        <TableCell className="max-w-xs whitespace-pre-line">{point.address}</TableCell>
                        <TableCell className="text-muted-foreground">{point.openingHours ?? '-'}</TableCell>
                        <TableCell>
                          <StatusBadge tone={point.active ? 'done' : 'idle'}>
                            {point.active ? t('admin.terroir.active') : t('admin.terroir.inactive')}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Can action="manage" subject="Delivery">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t('admin.terroir.pickupPoints.editAria', { city: point.city })}
                              onClick={() => onEditPoint(point)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Can>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
      </CardContent>
    </Card>
  )
}
