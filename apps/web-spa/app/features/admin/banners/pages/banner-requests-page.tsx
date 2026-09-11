import type { Resolver } from 'react-hook-form'
import type { BannerRequest, BannerRequestStatus } from '../utils/banner-requests-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@boilerstone/ui/components/primitives/tabs'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, Package, Store } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import {
  approveBannerRequest,
  BANNER_REQUEST_STATUSES,
  fetchBannerRequestsQueryOptions,
  rejectBannerRequest,
} from '../utils/banner-requests-queries'
import { toDateTimeLocal } from '../utils/datetime-local'

const TARGET_ICONS = {
  SUPPLIER: Store,
  PRODUCT: Package,
} as const

const STATUS_BADGE_VARIANT: Record<BannerRequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
}

const approveSchema = z.object({
  // `datetime-local` value; empty falls back to the requested start (or now).
  startsAt: z.string(),
  position: z.coerce.number().int().min(0),
})

type ApproveFormData = z.infer<typeof approveSchema>

/** Same 5..500 bounds as the API; the message is translated by the caller. */
function buildRejectSchema(message: string) {
  return z.object({
    reason: z.string().trim().min(5, message).max(500, message),
  })
}

type RejectFormData = z.infer<ReturnType<typeof buildRejectSchema>>

function isBannerRequestStatus(value: string): value is BannerRequestStatus {
  return (BANNER_REQUEST_STATUSES as readonly string[]).includes(value)
}

/**
 * Paid banner requests from the shops. Each one is shown as the phone would
 * render it so the reviewer judges the actual visual, then approves (which
 * creates the live banner) or rejects (which refunds the shop).
 */
export default function BannerRequestsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<BannerRequestStatus>('PENDING')
  const [approving, setApproving] = useState<BannerRequest | null>(null)
  const [rejecting, setRejecting] = useState<BannerRequest | null>(null)

  const { data, isLoading } = useQuery(fetchBannerRequestsQueryOptions(status))

  const invalidateRequests = () => queryClient.invalidateQueries({ queryKey: ['admin', 'banner-requests'] })

  const approve = useMutation({
    mutationFn: ({ id, input }: { id: string, input: ApproveFormData }) =>
      approveBannerRequest(id, {
        startsAt: input.startsAt ? new Date(input.startsAt).toISOString() : undefined,
        position: input.position,
      }),
    onSuccess: () => {
      invalidateRequests()
      // Approval creates a live banner, so the carousel list is stale too.
      queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] })
      setApproving(null)
    },
  })

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string, reason: string }) => rejectBannerRequest(id, reason),
    onSuccess: () => {
      invalidateRequests()
      setRejecting(null)
    },
  })

  const requests = data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/bannieres')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('admin.banners.requests.backToBanners')}
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{t('admin.banners.requests.title')}</h2>
            <p className="text-muted-foreground">{t('admin.banners.requests.description')}</p>
          </div>
        </div>
      </div>

      <Tabs
        value={status}
        onValueChange={(value) => {
          if (isBannerRequestStatus(value))
            setStatus(value)
        }}
      >
        <TabsList>
          {BANNER_REQUEST_STATUSES.map(value => (
            <TabsTrigger key={value} value={value}>
              {t(`admin.banners.requests.status.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading
        ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="aspect-2/1 w-full rounded-xl" />
              <Skeleton className="aspect-2/1 w-full rounded-xl" />
              <Skeleton className="aspect-2/1 w-full rounded-xl" />
            </div>
          )
        : requests.length === 0
          ? (
              <p className="text-muted-foreground rounded-xl border border-dashed px-6 py-16 text-center">
                {t('admin.banners.requests.empty')}
              </p>
            )
          : (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {requests.map(request => (
                  <BannerRequestCard
                    key={request.id}
                    request={request}
                    onApprove={() => setApproving(request)}
                    onReject={() => setRejecting(request)}
                  />
                ))}
              </div>
            )}

      <ApproveDialog
        request={approving}
        isPending={approve.isPending}
        isError={approve.isError}
        onClose={() => setApproving(null)}
        onSubmit={input => approving && approve.mutate({ id: approving.id, input })}
      />

      <RejectDialog
        request={rejecting}
        isPending={reject.isPending}
        isError={reject.isError}
        onClose={() => setRejecting(null)}
        onSubmit={reason => rejecting && reject.mutate({ id: rejecting.id, reason })}
      />
    </div>
  )
}

interface BannerRequestCardProps {
  request: BannerRequest
  onApprove: () => void
  onReject: () => void
}

function BannerRequestCard({ request, onApprove, onReject }: BannerRequestCardProps) {
  const { t, i18n } = useTranslation()
  const TargetIcon = TARGET_ICONS[request.targetType]

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })
  const formatDay = (value: string) =>
    new Date(value).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit' })

  return (
    <article className="overflow-hidden rounded-xl border shadow-sm">
      {/* The request as the phone would render it: image, scrim, caption. */}
      <div className="bg-muted relative aspect-2/1">
        <img src={request.imageUrl} alt="" className="h-full w-full object-cover" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.88) 100%)',
          }}
        />
        <div className="absolute inset-x-4 bottom-3">
          <p className="truncate text-lg font-bold text-white">{request.title}</p>
          {request.subtitle && <p className="truncate text-xs text-white/80">{request.subtitle}</p>}
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[request.status]} className="absolute top-2 right-2">
          {t(`admin.banners.requests.statusLabel.${request.status}`)}
        </Badge>
      </div>

      <div className="space-y-3 px-4 py-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <Store className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="truncate font-medium">{request.supplierName}</span>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <TargetIcon className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="text-muted-foreground shrink-0">
            {t(`admin.banners.targetType.${request.targetType}`)}
          </span>
          {request.targetLabel
            ? <span className="truncate">{request.targetLabel}</span>
            : <Badge variant="destructive">{t('admin.banners.brokenTarget')}</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">
            {t('admin.banners.requests.offer', {
              days: request.durationDays,
              price: request.price.toLocaleString(i18n.language),
            })}
          </span>
          {request.refundedAt
            ? <Badge variant="outline">{t('admin.banners.requests.refunded')}</Badge>
            : request.paidAt && <Badge variant="outline">{t('admin.banners.requests.paid')}</Badge>}
        </div>

        {request.status === 'PENDING' && (
          <p className="text-muted-foreground flex items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0" />
            {request.requestedStartAt
              ? t('admin.banners.requests.requestedStart', { date: formatDateTime(request.requestedStartAt) })
              : t('admin.banners.requests.requestedStartAsap')}
          </p>
        )}

        {request.status === 'APPROVED' && request.banner && (
          <div className="text-muted-foreground space-y-1">
            {request.banner.startsAt && request.banner.endsAt && (
              <p>
                {t('admin.banners.window', {
                  from: formatDay(request.banner.startsAt),
                  to: formatDay(request.banner.endsAt),
                })}
              </p>
            )}
            <p>
              {t('admin.banners.stats', {
                views: request.banner.impressions,
                clicks: request.banner.clicks,
              })}
              {!request.banner.isActive && ` · ${t('admin.banners.inactive')}`}
            </p>
          </div>
        )}

        {request.status === 'REJECTED' && request.rejectionReason && (
          <p className="text-muted-foreground">
            {t('admin.banners.requests.reason', { reason: request.rejectionReason })}
          </p>
        )}

        <p className="text-muted-foreground text-xs">
          {t('admin.banners.requests.requestedAt', { date: formatDateTime(request.createdAt) })}
        </p>

        {request.status === 'PENDING' && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onReject}>
              {t('admin.banners.requests.reject')}
            </Button>
            <Button size="sm" onClick={onApprove}>
              {t('admin.banners.requests.approve')}
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

interface ApproveDialogProps {
  request: BannerRequest | null
  isPending: boolean
  isError: boolean
  onClose: () => void
  onSubmit: (input: ApproveFormData) => void
}

function ApproveDialog({ request, isPending, isError, onClose, onSubmit }: ApproveDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={!!request} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        {request && (
          <ApproveForm
            key={request.id}
            request={request}
            isPending={isPending}
            isError={isError}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        )}
        {!request && <DialogTitle className="sr-only">{t('admin.banners.requests.approveDialog.title')}</DialogTitle>}
      </DialogContent>
    </Dialog>
  )
}

interface ApproveFormProps {
  request: BannerRequest
  isPending: boolean
  isError: boolean
  onCancel: () => void
  onSubmit: (input: ApproveFormData) => void
}

/** Keyed by request id from the dialog so each request opens with its own defaults. */
function ApproveForm({ request, isPending, isError, onCancel, onSubmit }: ApproveFormProps) {
  const { t } = useTranslation()

  const form = useForm<ApproveFormData>({
    resolver: zodResolver(approveSchema) as Resolver<ApproveFormData>,
    defaultValues: {
      // The shop's choice wins: its requested date if still ahead, otherwise
      // "dès validation" means now.
      startsAt: toDateTimeLocal(
        request.requestedStartAt && new Date(request.requestedStartAt) > new Date()
          ? request.requestedStartAt
          : new Date().toISOString(),
      ),
      position: 0,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t('admin.banners.requests.approveDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('admin.banners.requests.approveDialog.description', { days: request.durationDays, shop: request.supplierName })}
          </DialogDescription>
        </DialogHeader>

        <FormField
          control={form.control}
          name="startsAt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.banners.requests.approveDialog.startsAt')}</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormDescription>{t('admin.banners.requests.approveDialog.startsAtHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.banners.requests.approveDialog.position')}</FormLabel>
              <FormControl>
                <Input type="number" min={0} step={1} className="w-32" {...field} />
              </FormControl>
              <FormDescription>{t('admin.banners.form.positionHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {isError && (
          <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
            {t('admin.banners.requests.approveDialog.error')}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('common.saving') : t('admin.banners.requests.approveDialog.confirm')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}

interface RejectDialogProps {
  request: BannerRequest | null
  isPending: boolean
  isError: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}

function RejectDialog({ request, isPending, isError, onClose, onSubmit }: RejectDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={!!request} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        {request && (
          <RejectForm
            key={request.id}
            request={request}
            isPending={isPending}
            isError={isError}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        )}
        {!request && <DialogTitle className="sr-only">{t('admin.banners.requests.rejectDialog.title')}</DialogTitle>}
      </DialogContent>
    </Dialog>
  )
}

interface RejectFormProps {
  request: BannerRequest
  isPending: boolean
  isError: boolean
  onCancel: () => void
  onSubmit: (reason: string) => void
}

function RejectForm({ request, isPending, isError, onCancel, onSubmit }: RejectFormProps) {
  const { t } = useTranslation()

  const schema = useMemo(
    () => buildRejectSchema(t('admin.banners.requests.rejectDialog.reasonError')),
    [t],
  )

  const form = useForm<RejectFormData>({
    resolver: zodResolver(schema) as Resolver<RejectFormData>,
    defaultValues: { reason: '' },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(data => onSubmit(data.reason))} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t('admin.banners.requests.rejectDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('admin.banners.requests.rejectDialog.description', { shop: request.supplierName })}
          </DialogDescription>
        </DialogHeader>

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.banners.requests.rejectDialog.reason')}</FormLabel>
              <FormControl>
                <Textarea rows={4} maxLength={500} {...field} />
              </FormControl>
              <FormDescription>{t('admin.banners.requests.rejectDialog.reasonHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {isError && (
          <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
            {t('admin.banners.requests.rejectDialog.error')}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="submit" variant="destructive" disabled={isPending}>
            {isPending ? t('common.saving') : t('admin.banners.requests.rejectDialog.confirm')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
