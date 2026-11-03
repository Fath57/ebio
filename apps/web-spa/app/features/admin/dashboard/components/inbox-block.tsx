import type { InboxQueueKey } from '../utils/inbox-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { cn } from '@boilerstone/ui/lib/utils'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Can } from '@/lib/casl/can'
import { fetchInboxQueryOptions, sendDigestMutationOptions } from '../utils/inbox-queries'

/** Target page for each queue, already filtered where the list reads its filters from the URL. */
const QUEUE_LINKS: Record<InboxQueueKey, string> = {
  productReviews: '/admin/produits?moderation=PENDING',
  bannerRequests: '/admin/bannieres/demandes',
  supplierValidations: '/admin/validations',
  courierApplications: '/admin/livreurs',
  withdrawals: '/admin/reversements',
  disputes: '/admin/commandes?statut=DISPUTED',
}

export function InboxBlock() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery(fetchInboxQueryOptions())
  const { mutate: sendDigest, isPending: isSending } = useMutation({
    ...sendDigestMutationOptions,
    onSuccess: (result) => {
      toast.success(t('admin.dashboard.inbox.digestSent', { count: result.sent }))
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    )
  }

  const queues = data?.queues ?? []
  // A member with no actionable queue gets nothing to look at here.
  if (queues.length === 0)
    return null

  const allClear = queues.every(queue => queue.count === 0)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold">{t('admin.dashboard.inbox.title')}</h3>
        {allClear && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="text-ebio-green-600 h-4 w-4" />
            {t('admin.dashboard.inbox.allClear')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {queues.map((queue) => {
          const waiting = queue.count > 0
          const problem = queue.key === 'disputes'
          return (
            <Link
              key={queue.key}
              to={QUEUE_LINKS[queue.key]}
              className={cn(
                'group bg-card hover:border-primary focus-visible:ring-primary flex flex-col justify-between gap-3 rounded-xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none',
                waiting && !problem && 'border-ebio-earth-200 bg-ebio-earth-50 dark:border-ebio-earth-800 dark:bg-ebio-earth-900',
                waiting && problem && 'border-ebio-coral-200 bg-ebio-coral-50 dark:border-ebio-coral-800 dark:bg-ebio-coral-900',
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    'font-mono text-3xl leading-none font-bold tabular-nums',
                    !waiting && 'text-muted-foreground',
                    waiting && !problem && 'text-ebio-earth-800 dark:text-ebio-earth-100',
                    waiting && problem && 'text-ebio-coral-600 dark:text-ebio-coral-100',
                  )}
                >
                  {queue.count}
                </span>
                <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-colors" />
              </span>
              <span className={cn('text-sm', waiting ? 'font-medium' : 'text-muted-foreground')}>
                {t(`admin.dashboard.inbox.queues.${queue.key}`)}
              </span>
            </Link>
          )
        })}
      </div>

      <Can action="manage" subject="Staff">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={isSending}
            onClick={() => sendDigest()}
          >
            <Send className="h-4 w-4" />
            {t('admin.dashboard.inbox.sendDigest')}
          </Button>
        </div>
      </Can>
    </section>
  )
}
