import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@boilerstone/ui/components/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import {
  approveCourierMutationOptions,
  fetchAdminCourierQueryOptions,
  reactivateCourierMutationOptions,
  rejectCourierMutationOptions,
  suspendCourierMutationOptions,
} from '../utils/couriers-queries'

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  VALIDATED: 'default',
  REJECTED: 'destructive',
  SUSPENDED: 'destructive',
}

export default function AdminCourierDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { courierId } = useParams<{ courierId: string }>()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const { data: courier, isLoading } = useQuery(fetchAdminCourierQueryOptions(courierId ?? ''))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'couriers'] })
  }

  const { mutate: approve, isPending: isApproving } = useMutation({
    ...approveCourierMutationOptions,
    onSuccess: invalidate,
  })
  const { mutate: reject, isPending: isRejecting } = useMutation({
    ...rejectCourierMutationOptions,
    onSuccess: () => {
      invalidate()
      setRejectOpen(false)
      setRejectReason('')
    },
  })
  const { mutate: suspend, isPending: isSuspending } = useMutation({
    ...suspendCourierMutationOptions,
    onSuccess: invalidate,
  })
  const { mutate: reactivate, isPending: isReactivating } = useMutation({
    ...reactivateCourierMutationOptions,
    onSuccess: invalidate,
  })

  const busy = isApproving || isRejecting || isSuspending || isReactivating

  if (isLoading || !courier) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/livreurs')}>
            {`← ${t('admin.couriers.backToList')}`}
          </Button>
          <h2 className="mt-2 text-2xl font-bold">{courier.fullName}</h2>
          <p className="text-muted-foreground">{courier.phone}</p>
        </div>
        <Badge variant={STATUS_VARIANTS[courier.validationStatus] ?? 'outline'}>
          {t(`admin.couriers.statuses.${courier.validationStatus.toLowerCase()}`)}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.couriers.detail.application')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">{`${t('admin.couriers.columns.vehicle')} : `}</span>
              {t(`admin.couriers.vehicles.${courier.vehicleType.toLowerCase()}`)}
            </p>
            <p>
              <span className="text-muted-foreground">{`${t('admin.couriers.columns.zone')} : `}</span>
              {courier.zone}
            </p>
            <div>
              <span className="text-muted-foreground">{`${t('admin.couriers.detail.identityDocument')} : `}</span>
              {courier.identityDocumentUrl
                ? (
                    <a
                      href={courier.identityDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {t('admin.couriers.detail.viewDocument')}
                    </a>
                  )
                : courier.identityDocument
                  ? t('admin.couriers.detail.documentUnavailable')
                  : t('admin.couriers.detail.documentMissing')}
              {courier.identityDocumentUrl && courier.identityDocumentMimeType?.startsWith('image/') && (
                <a href={courier.identityDocumentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                  <img
                    src={courier.identityDocumentUrl}
                    alt={courier.identityDocumentName ?? t('admin.couriers.detail.identityDocument')}
                    className="max-h-64 rounded-md border object-contain"
                  />
                </a>
              )}
            </div>
            <p>
              <span className="text-muted-foreground">{`${t('admin.couriers.columns.submittedAt')} : `}</span>
              {new Date(courier.createdAt).toLocaleDateString('fr-FR')}
            </p>
            {courier.rejectionReason && (
              <p className="text-destructive">
                <span className="text-muted-foreground">{`${t('admin.couriers.detail.rejectionReason')} : `}</span>
                {courier.rejectionReason}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.couriers.detail.stats')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{courier.stats.delivered}</p>
              <p className="text-sm text-muted-foreground">{t('admin.couriers.detail.delivered')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{courier.stats.failed}</p>
              <p className="text-sm text-muted-foreground">{t('admin.couriers.detail.failed')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{courier.stats.active}</p>
              <p className="text-sm text-muted-foreground">{t('admin.couriers.detail.active')}</p>
            </div>
          </CardContent>
        </Card>

        {/* Wallet: negative = commission owed to eBio on cash deliveries */}
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.couriers.detail.wallet')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {courier.wallet
              ? (
                  <>
                    <p className={`text-2xl font-bold ${courier.wallet.balance < 0 ? 'text-destructive' : ''}`}>
                      {formatAmount(courier.wallet.balance)}
                    </p>
                    <p className={`text-sm ${courier.wallet.balance < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {courier.wallet.balance < 0
                        ? t('admin.couriers.detail.walletDebtHint')
                        : t('admin.couriers.detail.walletOwedHint')}
                    </p>
                  </>
                )
              : <p className="text-muted-foreground text-sm">{t('admin.couriers.detail.walletEmpty')}</p>}
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/reversements">{t('admin.couriers.detail.walletLink')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(courier.validationStatus === 'PENDING' || courier.validationStatus === 'REJECTED') && (
          <Button disabled={busy} onClick={() => approve(courier.id)}>
            {t('admin.couriers.actions.approve')}
          </Button>
        )}
        {courier.validationStatus === 'PENDING' && (
          <Button variant="destructive" disabled={busy} onClick={() => setRejectOpen(true)}>
            {t('admin.couriers.actions.reject')}
          </Button>
        )}
        {courier.validationStatus === 'VALIDATED' && (
          <Button variant="destructive" disabled={busy} onClick={() => suspend(courier.id)}>
            {t('admin.couriers.actions.suspend')}
          </Button>
        )}
        {courier.validationStatus === 'SUSPENDED' && (
          <Button disabled={busy} onClick={() => reactivate(courier.id)}>
            {t('admin.couriers.actions.reactivate')}
          </Button>
        )}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.couriers.rejectDialog.title')}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={event => setRejectReason(event.target.value)}
            placeholder={t('admin.couriers.rejectDialog.placeholder')}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 5 || isRejecting}
              onClick={() => reject({ courierId: courier.id, reason: rejectReason.trim() })}
            >
              {t('admin.couriers.actions.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
