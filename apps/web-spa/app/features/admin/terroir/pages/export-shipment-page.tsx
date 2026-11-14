import type { ExportAdminShipment, ExportAdminShipmentLine, ExportAdminShipmentOrder, ExportShipmentEventInput } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Flag, Gift, HandHelping, PackageX, Scale, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { BackLink } from '@/features/admin/common/components/back-link'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { ProductThumb } from '@/features/admin/common/components/product-thumb'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { Can } from '@/lib/casl/can'
import { DepartureStatusBadge, ShipmentStatusBadge } from '../components/terroir-status-badges'
import { ShipmentEventDialog } from '../forms/shipment-event-dialog'
import { WeighDialog } from '../forms/weigh-dialog'
import { useExportCountries } from '../utils/terroir-countries'
import { formatDateTime, formatDay, formatGrams } from '../utils/terroir-format'
import {
  addShipmentEvent,
  collectShipment,
  handOverShipment,
  markLineMissing,
  markShipmentLost,
  shipmentQueryOptions,
  TERROIR_KEY,
  terroirKeys,
  weighShipment,
} from '../utils/terroir-queries'

type Pending
  = | { kind: 'event' }
    | { kind: 'weigh' }
    | { kind: 'collect', order: ExportAdminShipmentOrder }
    | { kind: 'missing', line: ExportAdminShipmentLine, shopName: string }
    | { kind: 'handedOver' }
    | { kind: 'lost', damaged: boolean }

type Action = Pending & { grams?: number, event?: ExportShipmentEventInput }

/** A parcel that reached its end: no more steps, weighing or collection. */
const SETTLED = new Set(['HANDED_OVER', 'LOST', 'DAMAGED', 'CANCELLED'])

/**
 * One parcel: who pays and who receives, the departure, weights and prices,
 * each shop's order with its lines, and the timeline. Every action answers
 * with the fresh parcel; loss and damage are refunded without return.
 */
export default function ExportShipmentPage() {
  const { t } = useTranslation()
  const { labelOf } = useExportCountries()
  const { shipmentId = '' } = useParams()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data, isLoading, isError } = useQuery(shipmentQueryOptions(shipmentId))

  const close = () => {
    setPending(null)
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: (action: Action): Promise<ExportAdminShipment> => {
      switch (action.kind) {
        case 'collect':
          return collectShipment(shipmentId, action.order.supplierId)
        case 'missing':
          return markLineMissing(shipmentId, action.line.id)
        case 'weigh':
          return weighShipment(shipmentId, action.grams ?? 0)
        case 'handedOver':
          return handOverShipment(shipmentId)
        case 'lost':
          return markShipmentLost(shipmentId, action.damaged)
        default:
          return addShipmentEvent(shipmentId, action.event ?? {})
      }
    },
    onMutate: () => setError(null),
    onSuccess: (fresh, action) => {
      queryClient.setQueryData(terroirKeys.shipment(shipmentId), fresh)
      queryClient.invalidateQueries({ queryKey: [...TERROIR_KEY, 'departure'] })
      toast.success(t(`admin.terroir.shipment.done.${action.kind === 'lost' && action.damaged ? 'damaged' : action.kind}`))
      close()
    },
    onError: (failure: Error) => setError(failure.message || t('admin.terroir.genericError')),
  })

  if (isError) {
    return (
      <div className="space-y-4">
        <BackLink fallback="/admin/terroir/departs" />
        <p className="text-destructive" role="alert">{t('admin.terroir.shipment.notFound')}</p>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <BackLink fallback="/admin/terroir/departs" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const settled = SETTLED.has(data.status)
  const canHandOver = data.status === 'READY_FOR_PICKUP' || data.status === 'OUT_FOR_DELIVERY' || data.status === 'ARRIVED'

  return (
    <div className="space-y-6">
      <BackLink fallback={`/admin/terroir/departs/${data.departure.id}`} />

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{t('admin.terroir.shipment.title', { name: data.buyer.name })}</h2>
              <ShipmentStatusBadge status={data.status} />
            </div>
            <p className="text-muted-foreground text-sm">
              {t('admin.terroir.shipment.createdAt', { date: formatDateTime(data.createdAt) })}
              {' · '}
              {labelOf(data.country)}
            </p>
          </div>
          {!settled && (
            <Can action="manage" subject="Delivery">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setPending({ kind: 'event' })}>
                  <Flag className="mr-1 h-4 w-4" />
                  {t('admin.terroir.shipment.addEvent')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPending({ kind: 'weigh' })}>
                  <Scale className="mr-1 h-4 w-4" />
                  {t('admin.terroir.weigh.action')}
                </Button>
                {canHandOver && (
                  <Button variant="outline" size="sm" onClick={() => setPending({ kind: 'handedOver' })}>
                    <HandHelping className="mr-1 h-4 w-4" />
                    {t('admin.terroir.shipment.handedOver')}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setPending({ kind: 'lost', damaged: false })}>
                  <TriangleAlert className="mr-1 h-4 w-4" />
                  {t('admin.terroir.shipment.lost')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPending({ kind: 'lost', damaged: true })}>
                  <PackageX className="mr-1 h-4 w-4" />
                  {t('admin.terroir.shipment.damaged')}
                </Button>
              </div>
            </Can>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">{t('admin.terroir.shipment.people')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">{t('admin.terroir.shipment.buyer')}</p>
              <Link to={`/admin/utilisateurs/${data.buyer.id}`} className="font-medium hover:underline">{data.buyer.name}</Link>
              <p className="text-muted-foreground">{[data.buyer.phone, data.buyer.email].filter(Boolean).join(' · ')}</p>
            </div>
            {data.gift && (
              <div className="border-ebio-earth-200 bg-ebio-earth-50 dark:border-ebio-earth-800 dark:bg-ebio-earth-900 rounded-md border p-3">
                <p className="text-ebio-earth-800 dark:text-ebio-earth-100 flex items-center gap-1 font-medium">
                  <Gift className="h-4 w-4" aria-hidden="true" />
                  {t('admin.terroir.shipment.giftFor', { name: data.gift.name })}
                </p>
                <p className="text-muted-foreground">{[data.gift.phone, data.gift.email].filter(Boolean).join(' · ')}</p>
                {data.gift.message && <p className="mt-1 italic">{`« ${data.gift.message} »`}</p>}
              </div>
            )}
            <div>
              <p className="text-muted-foreground">{t('admin.terroir.shipment.reception')}</p>
              <p className="font-medium">{t(`admin.terroir.reception.${data.reception}`)}</p>
              {data.pickupPoint && (
                <p className="whitespace-pre-line">
                  {`${data.pickupPoint.city}, ${data.pickupPoint.address}`}
                  {data.pickupPoint.openingHours && `\n${data.pickupPoint.openingHours}`}
                </p>
              )}
              {data.homeAddress && <p className="whitespace-pre-line">{data.homeAddress}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t('admin.terroir.shipment.departure')}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link to={`/admin/terroir/departs/${data.departure.id}`} className="font-medium hover:underline">
              {t('admin.terroir.departureDetail.title', { date: formatDay(data.departure.departsOn) })}
            </Link>
            <p>{data.departure.agency}</p>
            <DepartureStatusBadge status={data.departure.status} />
            <p className="text-muted-foreground">{t('admin.terroir.departures.depositBefore', { date: formatDateTime(data.departure.depositDeadline) })}</p>
            <dl className="grid grid-cols-2 gap-2 pt-2">
              <dt className="text-muted-foreground">{t('admin.terroir.shipment.estimatedWeight')}</dt>
              <dd className="text-right font-mono">{formatGrams(data.estimatedWeightG)}</dd>
              <dt className="text-muted-foreground">{t('admin.terroir.shipment.actualWeight')}</dt>
              <dd className="text-right font-mono">{data.actualWeightG == null ? '-' : formatGrams(data.actualWeightG)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t('admin.terroir.shipment.amounts')}</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-muted-foreground">{t('admin.terroir.shipment.declaredValue')}</dt>
              <dd className="text-right font-mono">{formatAmount(data.declaredValue)}</dd>
              <dt className="text-muted-foreground">{t('admin.terroir.shipment.shippingPrice')}</dt>
              <dd className="text-right font-mono">{formatAmount(data.shippingPrice)}</dd>
              {data.homeDeliveryFee > 0 && (
                <>
                  <dt className="text-muted-foreground">{t('admin.terroir.shipment.homeDeliveryFee')}</dt>
                  <dd className="text-right font-mono">{formatAmount(data.homeDeliveryFee)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('admin.terroir.shipment.insurance')}</dt>
              <dd className="text-right font-mono">
                {data.insured ? formatAmount(data.insurancePrice) : t('admin.terroir.shipment.insuredNo')}
              </dd>
            </dl>
            {data.supplement.status !== 'NONE' && (
              <div className="mt-4 space-y-1 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{t('admin.terroir.shipment.supplement')}</p>
                  <StatusBadge tone={data.supplement.status === 'REQUESTED' ? 'action' : 'idle'}>
                    {t(`admin.terroir.supplementStatus.${data.supplement.status}`)}
                  </StatusBadge>
                </div>
                {data.supplement.amount != null && <p className="font-mono">{formatAmount(data.supplement.amount)}</p>}
                {data.supplement.status === 'REQUESTED' && data.supplement.deadline && (
                  <p className="text-muted-foreground text-xs">{t('admin.terroir.shipment.supplementDeadline', { date: formatDateTime(data.supplement.deadline) })}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('admin.terroir.shipment.orders')}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {data.orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              settled={settled}
              onCollect={() => setPending({ kind: 'collect', order })}
              onMissing={line => setPending({ kind: 'missing', line, shopName: order.shopName })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('admin.terroir.shipment.timeline')}</h3>
        {data.events.length === 0
          ? <p className="text-muted-foreground text-sm">{t('admin.terroir.shipment.noEvents')}</p>
          : (
              <ol className="border-ebio-neutral-200 dark:border-ebio-neutral-600 space-y-4 border-l pl-5">
                {data.events.map(event => (
                  <li key={event.id} className="relative">
                    <span className="bg-ebio-green-400 absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full" aria-hidden="true" />
                    <p className="text-sm font-medium">
                      {event.step ? t(`admin.terroir.shipmentStatus.${event.step}`) : t('admin.terroir.shipment.freeMessage')}
                    </p>
                    {event.message && <p className="text-sm whitespace-pre-line">{event.message}</p>}
                    {event.pickupPoint && <p className="text-muted-foreground text-sm whitespace-pre-line">{event.pickupPoint}</p>}
                    <p className="text-muted-foreground text-xs">
                      {formatDateTime(event.at)}
                      {event.author && ` · ${event.author}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
      </section>

      {pending?.kind === 'event' && (
        <ShipmentEventDialog
          scope="shipment"
          description={t('admin.terroir.events.shipmentDescription', { name: data.gift?.name ?? data.buyer.name })}
          isPending={mutation.isPending}
          error={error}
          onClose={close}
          onSubmit={event => mutation.mutate({ kind: 'event', event })}
        />
      )}
      {pending?.kind === 'weigh' && (
        <WeighDialog
          estimatedWeightG={data.estimatedWeightG}
          actualWeightG={data.actualWeightG}
          isPending={mutation.isPending}
          error={error}
          onClose={close}
          onSubmit={grams => mutation.mutate({ kind: 'weigh', grams })}
        />
      )}
      {pending && pending.kind !== 'event' && pending.kind !== 'weigh' && (
        <ConfirmDialog
          open
          destructive={pending.kind === 'missing' || pending.kind === 'lost'}
          onOpenChange={(open) => {
            if (!open)
              close()
          }}
          title={confirmTitle(pending, t)}
          description={confirmDescription(pending, t)}
          confirmLabel={confirmLabel(pending, t)}
          isPending={mutation.isPending}
          error={error}
          onConfirm={() => mutation.mutate(pending)}
        />
      )}
    </div>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']
type ConfirmPending = Exclude<Pending, { kind: 'event' } | { kind: 'weigh' }>

function confirmTitle(pending: ConfirmPending, t: Translate): string {
  if (pending.kind === 'collect')
    return t('admin.terroir.collection.confirmTitle', { shop: pending.order.shopName })
  if (pending.kind === 'missing')
    return t('admin.terroir.collection.missingTitle', { name: pending.line.name })
  if (pending.kind === 'handedOver')
    return t('admin.terroir.shipment.handedOverTitle')
  return pending.damaged ? t('admin.terroir.shipment.damagedTitle') : t('admin.terroir.shipment.lostTitle')
}

function confirmDescription(pending: ConfirmPending, t: Translate): string {
  if (pending.kind === 'collect')
    return t('admin.terroir.collection.confirmDescription')
  if (pending.kind === 'missing')
    return t('admin.terroir.collection.missingDescription', { shop: pending.shopName })
  if (pending.kind === 'handedOver')
    return t('admin.terroir.shipment.handedOverDescription')
  return t('admin.terroir.shipment.lostDescription')
}

function confirmLabel(pending: ConfirmPending, t: Translate): string {
  if (pending.kind === 'collect')
    return t('admin.terroir.collection.collect')
  if (pending.kind === 'missing')
    return t('admin.terroir.collection.missingConfirm')
  if (pending.kind === 'handedOver')
    return t('admin.terroir.shipment.handedOver')
  return pending.damaged ? t('admin.terroir.shipment.damaged') : t('admin.terroir.shipment.lost')
}

interface OrderCardProps {
  order: ExportAdminShipmentOrder
  settled: boolean
  onCollect: () => void
  onMissing: (line: ExportAdminShipmentLine) => void
}

function OrderCard({ order, settled, onCollect, onMissing }: OrderCardProps) {
  const { t } = useTranslation()
  const canAct = !settled && !order.collected

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate text-base">{order.shopName}</CardTitle>
          <p className="text-muted-foreground text-xs">
            <Link to={`/admin/commandes/${order.id}`} className="hover:underline">{order.orderNumber}</Link>
            {` · ${formatAmount(order.totalAmount)}`}
          </p>
          <StatusBadge tone={order.collected ? 'done' : 'action'}>
            {order.collected ? t('admin.terroir.collection.stateCollected') : t('admin.terroir.collection.stateToCollect')}
          </StatusBadge>
        </div>
        {canAct && (
          <Can action="manage" subject="Delivery">
            <Button size="sm" onClick={onCollect}>
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {t('admin.terroir.collection.collect')}
            </Button>
          </Can>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {order.lines.map(line => (
            <li key={line.id} className="flex items-center gap-3 py-2">
              <ProductThumb url={line.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${line.removed ? 'text-muted-foreground line-through' : ''}`}>{line.name}</p>
                <p className="text-muted-foreground text-xs">
                  {t('admin.terroir.shipment.lineSummary', { count: line.quantity, total: formatAmount(line.totalPrice) })}
                  {line.removed && ` · ${t('admin.terroir.shipment.removed')}`}
                </p>
              </div>
              {!settled && !line.removed && (
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
