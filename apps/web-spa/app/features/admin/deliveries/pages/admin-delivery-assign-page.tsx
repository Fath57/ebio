import type { CourierCandidate, VehicleType } from '../utils/deliveries-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
import { Checkbox } from '@boilerstone/ui/components/primitives/checkbox'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MapPin, RefreshCw, Search, Store } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { AssignDialog } from '../components/assign-dialog'
import { AssignMap } from '../components/assign-map'
import { CandidateList } from '../components/candidate-list'
import { DeliveryTimeline } from '../components/delivery-timeline'
import {
  ASSIGNABLE_STATUSES,
  assignDeliveryMutationOptions,
  fetchAdminDeliveryQueryOptions,
  fetchCandidatesQueryOptions,
  formatElapsed,
  getActiveOffer,
  rebroadcastDeliveryMutationOptions,
} from '../utils/deliveries-queries'

const RADIUS_OPTIONS = [3, 5, 10, 25]
const VEHICLES: VehicleType[] = ['MOTO', 'BICYCLE', 'CAR', 'ON_FOOT']
const SEARCH_DEBOUNCE_MS = 300

export default function AdminDeliveryAssignPage() {
  const { t } = useTranslation()
  const { deliveryId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [availableOnly, setAvailableOnly] = useState(true)
  const [radiusKm, setRadiusKm] = useState<number | undefined>(5)
  const [vehicleType, setVehicleType] = useState<VehicleType | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingCandidate, setPendingCandidate] = useState<CourierCandidate | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const { data: delivery, isLoading } = useQuery({
    ...fetchAdminDeliveryQueryOptions(deliveryId ?? ''),
    enabled: Boolean(deliveryId),
  })

  const filters = { q: debouncedSearch || undefined, radiusKm, availableOnly, vehicleType }
  const { data: candidates = [], isLoading: candidatesLoading, isFetching } = useQuery({
    ...fetchCandidatesQueryOptions(deliveryId ?? '', filters),
    enabled: Boolean(deliveryId),
    // Couriers move: keep the picture fresh while the operator decides.
    refetchInterval: 30_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'deliveries'] })
    if (delivery)
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders', delivery.orderId] })
  }

  const assignMutation = useMutation({
    ...assignDeliveryMutationOptions,
    onSuccess: (_data, variables) => {
      const name = pendingCandidate?.fullName ?? ''
      setPendingCandidate(null)
      setSelectedId(null)
      invalidate()
      toast.success(t('admin.deliveries.assignPage.assigned', { name }))
      navigate(`/admin/commandes/${delivery?.orderId ?? ''}`, { state: { assignedCourierId: variables.courierId } })
    },
    onError: (error: Error) => {
      toast.error(error.message || t('admin.deliveries.assignPage.assignError'))
      invalidate()
    },
  })

  const rebroadcastMutation = useMutation({
    ...rebroadcastDeliveryMutationOptions,
    onSuccess: () => {
      invalidate()
      toast.success(t('admin.deliveries.rebroadcastDone'))
    },
    onError: () => toast.error(t('admin.deliveries.rebroadcastError')),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    )
  }

  if (!delivery) {
    return <p className="text-muted-foreground">{t('common.error')}</p>
  }

  const assignable = ASSIGNABLE_STATUSES.includes(delivery.status)
  const activeOffer = delivery.status === 'AWAITING_COURIER' ? getActiveOffer(delivery.events) : null

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/livraisons">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('admin.deliveries.backToList')}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t('admin.deliveries.assignPage.title')}</h1>
        <Link to={`/admin/commandes/${delivery.orderId}`} className="font-medium underline-offset-4 hover:underline">
          {delivery.orderNumber}
        </Link>
        <Badge variant={delivery.status === 'AWAITING_COURIER' ? 'destructive' : 'secondary'}>
          {t(`admin.deliveries.statuses.${delivery.status}`)}
        </Badge>
        {delivery.status === 'AWAITING_COURIER' && (
          <span className="text-sm text-muted-foreground">
            {t('admin.deliveries.assignPage.waitingSince', { duration: formatElapsed(delivery.offeredAt) })}
          </span>
        )}
        {delivery.reassignmentCount > 0 && (
          <Badge variant="outline">{t('admin.deliveries.reassignments', { count: delivery.reassignmentCount })}</Badge>
        )}
        {activeOffer && (
          <Badge variant="outline" className="border-primary text-primary">
            {t('admin.deliveries.exclusiveOffer', { round: activeOffer.round })}
          </Badge>
        )}
        {delivery.status === 'AWAITING_COURIER' && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={rebroadcastMutation.isPending}
            onClick={() => rebroadcastMutation.mutate(delivery.id)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${rebroadcastMutation.isPending ? 'animate-spin' : ''}`} />
            {t('admin.deliveries.rebroadcast')}
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-3 py-4 text-sm md:grid-cols-3">
          <div className="flex items-start gap-2">
            <Store className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.deliveries.assignPage.pickup')}</p>
              <p className="font-medium">{delivery.supplierShopName}</p>
              <p className="text-muted-foreground">{delivery.pickupAddress}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.deliveries.assignPage.dropoff')}</p>
              <p className="font-medium">{delivery.buyerContact?.name ?? '—'}</p>
              <p className="text-muted-foreground">{delivery.dropoffAddress}</p>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.deliveries.assignPage.currentCourier')}</p>
            <p className="font-medium">{delivery.courier?.name ?? t('admin.deliveries.noCourier')}</p>
            {delivery.courier && <p className="text-muted-foreground">{delivery.courier.phone}</p>}
          </div>
        </CardContent>
      </Card>

      <DeliveryTimeline events={delivery.events} candidates={candidates} />

      {!assignable && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('admin.deliveries.assignPage.notAssignable')}
        </p>
      )}

      <div className="grid min-h-[520px] flex-1 gap-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('admin.deliveries.assignPage.search')}
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={availableOnly} onCheckedChange={checked => setAvailableOnly(checked === true)} />
              {t('admin.deliveries.assignPage.availableOnly')}
            </label>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">{t('admin.deliveries.assignPage.radius')}</Label>
              <Select
                value={radiusKm ? String(radiusKm) : 'ALL'}
                onValueChange={value => setRadiusKm(value === 'ALL' ? undefined : Number(value))}
                disabled={Boolean(debouncedSearch)}
              >
                <SelectTrigger className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTIONS.map(value => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                      {' km'}
                    </SelectItem>
                  ))}
                  <SelectItem value="ALL">{t('admin.deliveries.assignPage.anyRadius')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">{t('admin.deliveries.assignPage.vehicle')}</Label>
              <Select
                value={vehicleType ?? 'ALL'}
                onValueChange={value => setVehicleType(value === 'ALL' ? undefined : value as VehicleType)}
              >
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('admin.deliveries.assignPage.anyVehicle')}</SelectItem>
                  {VEHICLES.map(value => (
                    <SelectItem key={value} value={value}>
                      {t(`admin.couriers.vehicles.${value.toLowerCase()}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('admin.deliveries.assignPage.candidates', { count: candidates.length })}
            {debouncedSearch && ` · ${t('admin.deliveries.assignPage.searchHint')}`}
            {isFetching && !candidatesLoading && ' …'}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <CandidateList
              candidates={candidates}
              isLoading={candidatesLoading}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAssign={setPendingCandidate}
              assignDisabled={!assignable || assignMutation.isPending}
            />
          </div>
        </div>

        <AssignMap
          pickup={delivery.pickupPosition}
          dropoff={delivery.dropoffPosition}
          candidates={candidates}
          radiusKm={debouncedSearch ? undefined : radiusKm}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <AssignDialog
        delivery={delivery}
        candidate={pendingCandidate}
        isPending={assignMutation.isPending}
        onConfirm={(note) => {
          if (pendingCandidate)
            assignMutation.mutate({ deliveryId: delivery.id, courierId: pendingCandidate.id, note: note || undefined })
        }}
        onClose={() => setPendingCandidate(null)}
      />
    </div>
  )
}
