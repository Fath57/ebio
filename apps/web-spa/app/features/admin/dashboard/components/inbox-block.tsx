import type { InboxQueueKey } from '../utils/inbox-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Can } from '@/lib/casl/can'
import { fetchInboxQueryOptions, sendDigestMutationOptions } from '../utils/inbox-queries'

/** Target page for each queue. Neither the couriers nor the orders page reads a URL filter, hence plain paths. */
const QUEUE_LINKS: Record<InboxQueueKey, string> = {
  bannerRequests: '/admin/bannieres/demandes',
  supplierValidations: '/admin/validations',
  courierApplications: '/admin/livreurs',
  withdrawals: '/admin/reversements',
  disputes: '/admin/commandes',
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
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            {t('admin.dashboard.inbox.allClear')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {queues.map(queue => (
          <Link key={queue.key} to={QUEUE_LINKS[queue.key]} className="group">
            <Card className={`h-full py-3 transition-colors group-hover:border-primary ${queue.count > 0 ? 'border-ebio-coral-200' : ''}`}>
              <CardContent className="flex items-center justify-between gap-2 px-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="secondary"
                    className={queue.count > 0
                      ? 'bg-ebio-coral-400 text-white'
                      : 'text-muted-foreground'}
                  >
                    {queue.count}
                  </Badge>
                  <span className="text-sm truncate">
                    {t(`admin.dashboard.inbox.queues.${queue.key}`)}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </CardContent>
            </Card>
          </Link>
        ))}
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
