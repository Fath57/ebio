import type { ExportCollectionLine, ExportCollectionShop, ExportDepartureShipmentRow } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@boilerstone/ui/components/primitives/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileText, Flag, PackageX, Scale, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { BackLink } from '@/features/admin/common/components/back-link'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { ProductThumb } from '@/features/admin/common/components/product-thumb'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { Can } from '@/lib/casl/can'
import { FillGauge } from '../components/fill-gauge'
import { DepartureStatusBadge, ShipmentStatusBadge } from '../components/terroir-status-badges'
import { ShipmentEventDialog } from '../forms/shipment-event-dialog'
import { WeighDialog } from '../forms/weigh-dialog'
import { formatDateTime, formatDay, formatGrams, formatKg } from '../utils/terroir-format'
import {
  addDepartureEvent,
  collectShipment,
  departureDetailQueryOptions,
  markLineMissing,
  openManifest,
  TERROIR_KEY,
  weighShipment,
} from '../utils/terroir-queries'

/** Parcels still at eBio: the only ones the API lets us weigh. */
const WEIGHABLE_STATUSES = new Set<string>(['PAID', 'COLLECTING', 'PACKED'])

type Pending
  = | { kind: 'event' }
    | { kind: 'collect', shop: ExportCollectionShop }
    | { kind: 'missing', line: ExportCollectionLine, shopName: string }
    | { kind: 'weigh', shipment: ExportDepartureShipmentRow }

/**
 * One departure as the logistics team works it: how full it is, what to fetch
 * from each shop (« Collecté » releases the shop's money at once), the parcels
 * to weigh, one step for every parcel, and the printable list for the agency.
 */
export default function ExportDepartureDetailPage() {
  const { t } = useTranslation()
  const { departureId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, isLoading, isError } = useQuery(departureDetailQueryOptions(departureId))

  const close = () => {
    setPending(null)
    setError(null)
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: TERROIR_KEY })

  const mutation = useMutation({
    mutationFn: async (action: Pending & { grams?: number, step?: Parameters<typeof addDepartureEvent>[1], message?: string | null }) => {
      if (action.kind === 'collect') {
        // A shop's products may sit in several parcels: each one records its own collection.
        const shipmentIds = [...new Set(action.shop.lines.map(line => line.shipmentId))]
        for (const shipmentId of shipmentIds)
          await collectShipment(shipmentId, action.shop.supplierId)
        return t('admin.terroir.collection.collected', { shop: action.shop.shopName })
      }
      if (action.kind === 'missing') {
        await markLineMissing(action.line.shipmentId, action.line.orderItemId)
        return t('admin.terroir.collection.missingDone', { name: action.line.name })
      }
      if (action.kind === 'weigh') {
        await weighShipment(action.shipment.id, action.grams ?? 0)
        return t('admin.terroir.weigh.done')
      }
      const applied = await addDepartureEvent(departureId, action.step ?? 'DROPPED_AT_AGENCY', action.message ?? null)
      return t('admin.terroir.events.departureDone', { count: applied })
    },
    onMutate: () => setError(null),
    onSuccess: (message) => {
      refresh()
      toast.success(message)
      close()
    },
    onError: (failure: Error) => {
      refresh()
      setError(failure.message || t('admin.terroir.genericError'))
    },
  })

  const manifest = useMutation({
    mutationFn: () => openManifest(departureId),
    onError: (failure: Error) => toast.error(failure.message || t('admin.terroir.departureDetail.manifestError')),
  })

  if (isError) {
    return (
      <div className="space-y-4">
        <BackLink fallback="/admin/terroir/departs" />
        <p className="text-destructive" role="alert">{t('admin.terroir.departureDetail.notFound')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BackLink fallback="/admin/terroir/departs" />

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-6 py-5">
          {data
            ? (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">
                      {t('admin.terroir.departureDetail.title', { date: formatDay(data.departsOn) })}
                    </h2>
                    <DepartureStatusBadge status={data.status} />
                  </div>
                  <p className="text-muted-foreground text-sm">{data.agency.name}</p>
                  <p className="text-sm">{t('admin.terroir.departures.depositBefore', { date: formatDateTime(data.depositDeadline) })}</p>
                  <p className="text-muted-foreground text-sm">{t('admin.terroir.departures.orderBefore', { date: formatDateTime(data.orderBefore) })}</p>
                  <p className="text-muted-foreground text-sm">
                    {t('admin.terroir.departures.arrivalRange', { from: formatDay(data.arrival.from), to: formatDay(data.arrival.to) })}
                  </p>
                  <ul className="pt-1 text-sm">
                    {data.rates.map(rate => (
                      <li key={rate.country}>
                        <span className="font-medium">{t(`admin.terroir.countries.${rate.country}`)}</span>
                        {' · '}
                        {t('admin.terroir.departures.ratePerKg', { price: formatAmount(rate.pricePerKg), min: formatKg(rate.minBilledKg) })}
                        {rate.homeDeliveryFee != null && ` · ${t('admin.terroir.departures.homeFee', { fee: formatAmount(rate.homeDeliveryFee) })}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            : <Skeleton className="h-24 w-72" />}
          <div className="flex min-w-56 flex-col gap-3">
            {data && <FillGauge fill={data.fill} />}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={manifest.isPending} onClick={() => manifest.mutate()}>
                <FileText className="mr-1 h-4 w-4" />
                {t('admin.terroir.departureDetail.manifest')}
              </Button>
              {data && data.status !== 'CANCELLED' && (
                <Can action="manage" subject="Delivery">
                  <Button size="sm" onClick={() => setPending({ kind: 'event' })}>
                    <Flag className="mr-1 h-4 w-4" />
                    {t('admin.terroir.departureDetail.addStep')}
                  </Button>
                </Can>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">{t('admin.terroir.collection.title')}</h3>
          <p className="text-muted-foreground text-sm">{t('admin.terroir.collection.hint')}</p>
        </div>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {data && data.collection.length === 0 && (
          <p className="text-muted-foreground text-sm">{t('admin.terroir.collection.empty')}</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {data?.collection.map(shop => (
            <CollectionCard
              key={shop.supplierId}
              shop={shop}
              onCollect={() => setPending({ kind: 'collect', shop })}
              onMissing={line => setPending({ kind: 'missing', line, shopName: shop.shopName })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('admin.terroir.departureDetail.shipments', { count: data?.shipments.length ?? 0 })}</h3>
        {data && data.shipments.length === 0
          ? <p className="text-muted-foreground text-sm">{t('admin.terroir.departureDetail.noShipments')}</p>
          : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin.terroir.shipment.buyer')}</TableHead>
                      <TableHead>{t('admin.terroir.shipment.country')}</TableHead>
                      <TableHead>{t('admin.terroir.status')}</TableHead>
                      <TableHead className="text-right">{t('admin.terroir.shipment.estimatedWeight')}</TableHead>
                      <TableHead className="text-right">{t('admin.terroir.shipment.actualWeight')}</TableHead>
                      <TableHead>{t('admin.terroir.shipment.insured')}</TableHead>
                      <TableHead className="text-right"><span className="sr-only">{t('admin.terroir.actions')}</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.shipments.map(shipment => (
                      <TableRow
                        key={shipment.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/admin/terroir/colis/${shipment.id}`)}
                      >
                        <TableCell>
                          <Link
                            to={`/admin/terroir/colis/${shipment.id}`}
                            className="font-medium hover:underline"
                            onClick={event => event.stopPropagation()}
                          >
                            {shipment.buyer}
                          </Link>
                        </TableCell>
                        <TableCell>{t(`admin.terroir.countries.${shipment.country}`)}</TableCell>
                        <TableCell><ShipmentStatusBadge status={shipment.status} /></TableCell>
                        <TableCell className="text-right font-mono">{formatGrams(shipment.estimatedWeightG)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {shipment.actualWeightG == null ? '-' : formatGrams(shipment.actualWeightG)}
                        </TableCell>
                        <TableCell>
                          {shipment.insured
                            ? (
                                <span className="text-ebio-green-600 dark:text-ebio-green-200 inline-flex items-center gap-1 text-sm">
                                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                  {t('admin.terroir.shipment.insuredYes')}
                                </span>
                              )
                            : <span className="text-muted-foreground text-sm">{t('admin.terroir.shipment.insuredNo')}</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Can action="manage" subject="Delivery">
                            {WEIGHABLE_STATUSES.has(shipment.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setPending({ kind: 'weigh', shipment })
                                }}
                              >
                                <Scale className="mr-1 h-4 w-4" />
                                {t('admin.terroir.weigh.action')}
                              </Button>
                            )}
                          </Can>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
      </section>

      {pending?.kind === 'event' && data && (
        <ShipmentEventDialog
          scope="departure"
          description={t('admin.terroir.events.departureDescription', { count: data.shipments.length })}
          isPending={mutation.isPending}
          error={error}
          onClose={close}
          onSubmit={input => mutation.mutate({ kind: 'event', step: input.step ?? undefined, message: input.message ?? null })}
        />
      )}
      {pending?.kind === 'weigh' && (
        <WeighDialog
          estimatedWeightG={pending.shipment.estimatedWeightG}
          actualWeightG={pending.shipment.actualWeightG}
          isPending={mutation.isPending}
          error={error}
          onClose={close}
          onSubmit={grams => mutation.mutate({ ...pending, grams })}
        />
      )}
      {pending?.kind === 'collect' && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open)
              close()
          }}
          title={t('admin.terroir.collection.confirmTitle', { shop: pending.shop.shopName })}
          description={t('admin.terroir.collection.confirmDescription')}
          confirmLabel={t('admin.terroir.collection.collect')}
          isPending={mutation.isPending}
          error={error}
          onConfirm={() => mutation.mutate(pending)}
        />
      )}
      {pending?.kind === 'missing' && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(open) => {
            if (!open)
              close()
          }}
          title={t('admin.terroir.collection.missingTitle', { name: pending.line.name })}
          description={t('admin.terroir.collection.missingDescription', { shop: pending.shopName })}
          confirmLabel={t('admin.terroir.collection.missingConfirm')}
          isPending={mutation.isPending}
          error={error}
          onConfirm={() => mutation.mutate(pending)}
        />
      )}
    </div>
  )
}

interface CollectionCardProps {
  shop: ExportCollectionShop
  onCollect: () => void
  onMissing: (line: ExportCollectionLine) => void
}

function CollectionCard({ shop, onCollect, onMissing }: CollectionCardProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate text-base">{shop.shopName}</CardTitle>
          <StatusBadge tone={shop.collected ? 'done' : 'action'}>
            {shop.collected ? t('admin.terroir.collection.stateCollected') : t('admin.terroir.collection.stateToCollect')}
          </StatusBadge>
        </div>
        {!shop.collected && (
          <Can action="manage" subject="Delivery">
            <Button size="sm" onClick={onCollect}>
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t('admin.terroir.collection.collect')}
            </Button>
          </Can>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {shop.lines.map(line => (
            <li key={line.orderItemId} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 items-center gap-3">
                <ProductThumb url={line.imageUrl} />
                <span className="min-w-0">
                  <span className="font-mono">{`${line.quantity} × `}</span>
                  <span className="font-medium">{line.name}</span>
                  <span className="text-muted-foreground block font-mono text-xs">{line.orderNumber}</span>
                </span>
              </span>
              {!shop.collected && (
                <Can action="manage" subject="Delivery">
                  <Button variant="ghost" size="sm" onClick={() => onMissing(line)}>
                    <PackageX className="mr-1 h-4 w-4" />
                    {t('admin.terroir.collection.missing')}
                  </Button>
                </Can>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
