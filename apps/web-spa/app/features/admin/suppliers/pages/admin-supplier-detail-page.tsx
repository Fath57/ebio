import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  fetchAdminSupplierQueryOptions,
  reinstateSupplier,
  suspendSupplier,
  updateSupplierCommissionRate,
} from '../utils/suppliers-queries'

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function InfoRow({ label, value }: { label: string, value: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? '—'}</span>
    </div>
  )
}

export default function AdminSupplierDetailPage() {
  const { t, i18n } = useTranslation()
  const { supplierId } = useParams()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const { data: supplier, isLoading } = useQuery({
    ...fetchAdminSupplierQueryOptions(supplierId ?? ''),
    enabled: Boolean(supplierId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] })
    // Suspendre ou réactiver modifie le statut lu par la file de validation.
    queryClient.invalidateQueries({ queryKey: ['admin', 'validation'] })
  }

  const suspend = useMutation({
    mutationFn: () => suspendSupplier(supplierId ?? '', reason),
    onSuccess: () => {
      setReason('')
      invalidate()
    },
  })

  const reinstate = useMutation({
    mutationFn: () => reinstateSupplier(supplierId ?? ''),
    onSuccess: invalidate,
  })

  // Percent in the field, fraction in the API — humans negotiate in percent.
  const [ratePercent, setRatePercent] = useState('')
  const [isEditingRate, setIsEditingRate] = useState(false)

  const saveRate = useMutation({
    mutationFn: (rate: number | null) => updateSupplierCommissionRate(supplierId ?? '', rate),
    onSuccess: () => {
      setIsEditingRate(false)
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions'] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!supplier) {
    return <p className="text-muted-foreground">{t('admin.suppliers.notFound')}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/fournisseurs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">{supplier.shopName}</h2>
        <Badge>{t(`admin.suppliers.status.${supplier.validationStatus}`)}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.suppliers.detail.activity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow
              label={t('admin.suppliers.columns.products')}
              value={String(supplier.productCount)}
            />
            <InfoRow
              label={t('admin.suppliers.columns.orders')}
              value={String(supplier.orderCount)}
            />
            <InfoRow
              label={t('admin.suppliers.detail.revenue')}
              value={`${supplier.revenue.toLocaleString('fr-FR')} FCFA`}
            />
            <InfoRow
              label={t('admin.suppliers.columns.rating')}
              value={supplier.rating !== null
                ? `${supplier.rating.toFixed(1)} (${supplier.reviewCount})`
                : null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.suppliers.detail.commission.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isEditingRate
              ? (
                  <>
                    <InfoRow
                      label={t('admin.suppliers.detail.commission.currentRate')}
                      value={supplier.commissionRate != null
                        ? `${(supplier.commissionRate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
                        : t('admin.suppliers.detail.commission.categoryGrid')}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRatePercent(supplier.commissionRate != null
                            ? String(supplier.commissionRate * 100)
                            : '')
                          setIsEditingRate(true)
                        }}
                      >
                        {t('admin.suppliers.detail.commission.edit')}
                      </Button>
                      {supplier.commissionRate != null && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saveRate.isPending}
                          onClick={() => saveRate.mutate(null)}
                        >
                          {t('admin.suppliers.detail.commission.reset')}
                        </Button>
                      )}
                    </div>
                  </>
                )
              : (
                  <>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        step={0.1}
                        className="w-28"
                        value={ratePercent}
                        onChange={event => setRatePercent(event.target.value)}
                      />
                      <span className="text-muted-foreground text-sm">%</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={saveRate.isPending || ratePercent === ''}
                        onClick={() => {
                          const percent = Number(ratePercent)
                          if (!Number.isNaN(percent) && percent >= 0 && percent <= 50)
                            saveRate.mutate(percent / 100)
                        }}
                      >
                        {t('common.save')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setIsEditingRate(false)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('admin.suppliers.detail.commission.hint')}
                    </p>
                  </>
                )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.suppliers.detail.owner')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('admin.users.columns.name')} value={supplier.owner.name} />
            <InfoRow label={t('admin.users.columns.email')} value={supplier.owner.email} />
            <InfoRow label={t('admin.users.columns.phone')} value={supplier.owner.phone} />
            <InfoRow
              label={t('admin.suppliers.detail.mobileMoney')}
              value={supplier.mobileMoneyNumber}
            />
            <Separator className="my-2" />
            <InfoRow
              label={t('admin.suppliers.detail.since')}
              value={new Date(supplier.createdAt).toLocaleDateString(i18n.language)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.suppliers.detail.location')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('admin.suppliers.detail.address')} value={supplier.address} />
            <InfoRow
              label={t('admin.suppliers.detail.neighborhood')}
              value={supplier.neighborhood}
            />
            <InfoRow
              label={t('admin.suppliers.detail.coordinates')}
              value={supplier.latitude !== null
                ? `${supplier.latitude.toFixed(4)}, ${supplier.longitude?.toFixed(4)}`
                : null}
            />
            <InfoRow label={t('admin.suppliers.detail.timezone')} value={supplier.timezone} />
            <InfoRow label={t('admin.suppliers.detail.mode')} value={supplier.mode} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.suppliers.suspension.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {supplier.validationStatus === 'SUSPENDED'
            ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    {t('admin.suppliers.suspension.suspendedHint')}
                  </p>
                  <Button
                    variant="outline"
                    disabled={reinstate.isPending}
                    onClick={() => reinstate.mutate()}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('admin.suppliers.suspension.reinstate')}
                  </Button>
                </>
              )
            : (
                <>
                  <p className="text-muted-foreground text-sm">
                    {t('admin.suppliers.suspension.hint')}
                  </p>
                  <Textarea
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    placeholder={t('admin.suppliers.suspension.reasonPlaceholder')}
                  />
                  <Button
                    variant="destructive"
                    disabled={suspend.isPending || reason.trim().length === 0}
                    onClick={() => suspend.mutate()}
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    {t('admin.suppliers.suspension.suspend')}
                  </Button>
                </>
              )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.suppliers.detail.openingHours')}</CardTitle>
        </CardHeader>
        <CardContent>
          {supplier.openingHours
            ? (
                <div className="grid gap-1 sm:grid-cols-2">
                  {DAY_KEYS.map((day) => {
                    const slot = supplier.openingHours?.[day]
                    const closed = !slot || slot.closed
                    return (
                      <InfoRow
                        key={day}
                        label={t(`admin.suppliers.days.${day}`)}
                        value={closed
                          ? t('admin.suppliers.detail.closed')
                          : `${slot?.open} – ${slot?.close}`}
                      />
                    )
                  })}
                </div>
              )
            : (
                <p className="text-muted-foreground text-sm">
                  {t('admin.suppliers.detail.noOpeningHours')}
                </p>
              )}
        </CardContent>
      </Card>
    </div>
  )
}
