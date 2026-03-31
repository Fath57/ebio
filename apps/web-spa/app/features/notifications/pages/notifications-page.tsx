import { client } from '@boilerstone/openapi-generator'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  BellOff,
  CheckCheck,
  CreditCard,
  MessageCircle,
  Package,
  ShieldAlert,
  Star,
  TrendingDown,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown> | null
  channel: string
  readAt: string | null
  createdAt: string
}

const TYPE_ICONS: Record<string, typeof Package> = {
  ORDER_PLACED: Package,
  ORDER_ACCEPTED: Package,
  ORDER_REJECTED: Package,
  ORDER_READY: Package,
  ORDER_DELIVERED: Package,
  ORDER_CANCELLED: Package,
  PAYMENT_RECEIVED: CreditCard,
  PAYMENT_RELEASED: CreditCard,
  NEW_MESSAGE: MessageCircle,
  NEW_REVIEW: Star,
  STOCK_ALERT: TrendingDown,
  SUPPLIER_VALIDATED: ShieldAlert,
  SUPPLIER_REJECTED: ShieldAlert,
  SUPPLIER_COMPLEMENT: ShieldAlert,
  DISPUTE_OPENED: ShieldAlert,
  DISPUTE_RESOLVED: ShieldAlert,
}

function notificationsQueryOptions() {
  return {
    queryKey: ['notifications'],
    queryFn: async () => {
      const result = await client.get({ url: '/api/notifications' })
      return result.data as NotificationItem[]
    },
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 1)
    return 'À l\'instant'
  if (diffMin < 60)
    return `${diffMin} min`
  if (diffHours < 24)
    return `${diffHours} h`
  if (diffDays < 7)
    return `${diffDays} j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function NotificationsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: notifications, isLoading } = useQuery(notificationsQueryOptions())

  const { mutate: markAsRead } = useMutation({
    mutationFn: async (id: string) => {
      await client.patch({ url: `/api/notifications/${id}/read` })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const { mutate: markAllAsRead, isPending: isMarkingAll } = useMutation({
    mutationFn: async () => {
      await client.patch({ url: '/api/notifications/read-all' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success(t('notifications.toast.allRead'))
    },
  })

  const unreadCount = notifications?.filter(n => !n.readAt).length ?? 0

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">{t('notifications.title')}</h2>
          {unreadCount > 0 && (
            <Badge variant="default">{unreadCount}</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsRead()}
            disabled={isMarkingAll}
          >
            <CheckCheck className="mr-1.5 h-4 w-4" />
            {t('notifications.markAllAsRead')}
          </Button>
        )}
      </div>

      {!notifications || notifications.length === 0
        ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12">
                <BellOff className="h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
              </CardContent>
            </Card>
          )
        : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const Icon = TYPE_ICONS[notification.type] ?? Bell
                const isUnread = !notification.readAt

                return (
                  <Card
                    key={notification.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${isUnread ? 'border-primary/20 bg-primary/[0.02]' : ''}`}
                    onClick={() => {
                      if (isUnread)
                        markAsRead(notification.id)
                    }}
                  >
                    <CardContent className="flex items-start gap-3 py-4">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${isUnread ? 'font-semibold' : 'font-medium'}`}>
                            {notification.title}
                          </p>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                          {notification.body}
                        </p>
                      </div>
                      {isUnread && (
                        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
    </div>
  )
}
