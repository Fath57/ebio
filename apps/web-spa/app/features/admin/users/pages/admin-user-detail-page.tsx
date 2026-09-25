import type { SanctionKind } from '../components/user-sanction-dialogs'
import { Alert, AlertDescription } from '@boilerstone/ui/components/primitives/alert'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, CircleCheck, Info, PauseCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Can } from '@/lib/casl/can'
import { AuditTimeline } from '../components/audit-timeline'
import { BuyerCheckoutPanel } from '../components/buyer-checkout-panel'
import { UserSanctionDialog } from '../components/user-sanction-dialogs'
import { UserStatusBadge } from '../components/user-status-badge'
import {
  banUserMutationOptions,
  fetchAdminUserQueryOptions,
  reinstateUserMutationOptions,
  ROLE_VARIANTS,
  suspendUserMutationOptions,
} from '../utils/users-queries'

function InfoRow({ label, value }: { label: string, value: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? '—'}</span>
    </div>
  )
}

function LinkRow({ label, to, value, hint }: { label: string, to: string, value: string, hint?: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <Link to={to} className="font-medium text-primary underline-offset-4 hover:underline">{value}</Link>
        {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
      </span>
    </div>
  )
}

export default function AdminUserDetailPage() {
  const { t, i18n } = useTranslation()
  const { userId } = useParams()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<SanctionKind | null>(null)

  const { data: user, isLoading } = useQuery({
    ...fetchAdminUserQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
  })

  const afterChange = (messageKey: string) => {
    toast.success(t(messageKey))
    setDialog(null)
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'audit'] })
  }
  const onError = (error: Error) => {
    toast.error(error.message || t('common.error'))
  }

  const suspend = useMutation({
    ...suspendUserMutationOptions,
    onSuccess: () => afterChange('admin.users.actions.suspended'),
    onError,
  })
  const ban = useMutation({
    ...banUserMutationOptions,
    onSuccess: () => afterChange('admin.users.actions.banned'),
    onError,
  })
  const reinstate = useMutation({
    ...reinstateUserMutationOptions,
    onSuccess: () => afterChange('admin.users.actions.reinstated'),
    onError,
  })
  const isPending = suspend.isPending || ban.isPending || reinstate.isPending

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!user)
    return <p className="text-muted-foreground">{t('admin.users.detail.notFound')}</p>

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString(i18n.language) : null
  const yesNo = (value: boolean) => (value ? t('admin.users.detail.yes') : t('admin.users.detail.no'))
  const isStaff = user.role === 'ADMIN'

  const handleConfirm = ({ reason, until }: { reason: string, until?: Date }) => {
    if (!userId)
      return
    if (dialog === 'suspend')
      suspend.mutate({ id: userId, reason, until })
    else if (dialog === 'ban')
      ban.mutate({ id: userId, reason })
    else if (dialog === 'reinstate')
      reinstate.mutate({ id: userId, note: reason || undefined })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/utilisateurs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Link>
        </Button>
        <h2 className="text-2xl font-bold">{user.name}</h2>
        <Badge variant={ROLE_VARIANTS[user.role] ?? 'outline'}>
          {t(`admin.users.role.${user.role}`)}
          {user.staffRole && ` · ${user.staffRole.name}`}
        </Badge>
        <UserStatusBadge status={user.status} isBlocked={user.isBlocked} suspendedUntil={user.suspendedUntil} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.users.detail.identity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('admin.users.columns.email')} value={user.email} />
            <InfoRow label={t('admin.users.columns.phone')} value={user.phone} />
            <InfoRow label={t('admin.users.detail.emailVerified')} value={yesNo(user.emailVerified)} />
            <Separator className="my-2" />
            <InfoRow label={t('admin.users.detail.lastLogin')} value={formatDate(user.lastLoginAt)} />
            <InfoRow label={t('admin.users.columns.since')} value={formatDate(user.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.users.detail.activity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label={t('admin.users.detail.ordersCount')} value={String(user.ordersCount)} />
            {user.supplier
              ? (
                  <LinkRow
                    label={t('admin.users.columns.shop')}
                    to={`/admin/fournisseurs/${user.supplier.id}`}
                    value={user.supplier.shopName}
                    hint={user.supplier.validationStatus}
                  />
                )
              : <InfoRow label={t('admin.users.columns.shop')} value={null} />}
            {user.courier
              ? (
                  <LinkRow
                    label={t('admin.users.detail.courier')}
                    to={`/admin/livreurs/${user.courier.id}`}
                    value={t('admin.users.detail.courierProfile')}
                    hint={`${user.courier.validationStatus} · ${user.courier.isAvailable ? t('admin.users.detail.available') : t('admin.users.detail.unavailable')}`}
                  />
                )
              : <InfoRow label={t('admin.users.detail.courier')} value={null} />}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('admin.users.detail.sanction')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <InfoRow label={t('admin.users.columns.status')} value={t(`admin.users.status.${user.isBlocked ? user.status.toLowerCase() : 'active'}`)} />
              <InfoRow label={t('admin.users.actions.reason')} value={user.statusReason} />
              {user.status === 'SUSPENDED' && (
                <InfoRow label={t('admin.users.actions.until')} value={user.suspendedUntil ? formatDate(user.suspendedUntil) : t('admin.users.detail.untilReinstated')} />
              )}
              <InfoRow label={t('admin.users.detail.changedBy')} value={user.statusChangedBy?.name ?? null} />
              <InfoRow label={t('admin.users.detail.changedAt')} value={formatDate(user.statusChangedAt)} />
            </div>

            {isStaff
              ? (
                  <Alert>
                    <Info />
                    <AlertDescription className="flex flex-wrap items-center gap-1">
                      <span>{t('admin.users.actions.staffHint')}</span>
                      <Link to="/admin/equipe" className="font-medium underline underline-offset-4">
                        {t('nav.team')}
                      </Link>
                    </AlertDescription>
                  </Alert>
                )
              : (
                  <Can action="manage" subject="User">
                    <div className="flex flex-wrap gap-2">
                      {user.isBlocked
                        ? (
                            <Button onClick={() => setDialog('reinstate')} disabled={isPending}>
                              <CircleCheck className="mr-2 h-4 w-4" />
                              {t('admin.users.actions.reinstate')}
                            </Button>
                          )
                        : (
                            <Button variant="secondary" onClick={() => setDialog('suspend')} disabled={isPending}>
                              <PauseCircle className="mr-2 h-4 w-4" />
                              {t('admin.users.actions.suspend')}
                            </Button>
                          )}
                      {user.status !== 'BANNED' && (
                        <Button variant="destructive" onClick={() => setDialog('ban')} disabled={isPending}>
                          <Ban className="mr-2 h-4 w-4" />
                          {t('admin.users.actions.ban')}
                        </Button>
                      )}
                    </div>
                  </Can>
                )}
          </CardContent>
        </Card>

        <BuyerCheckoutPanel userId={user.id} />

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t('admin.users.audit.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditTimeline entries={user.history} />
          </CardContent>
        </Card>
      </div>

      <UserSanctionDialog
        kind={dialog}
        userName={user.name}
        isPending={isPending}
        onConfirm={handleConfirm}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}
