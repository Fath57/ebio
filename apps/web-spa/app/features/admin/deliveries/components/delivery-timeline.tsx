import type { TFunction } from 'i18next'
import type { CourierCandidate, DeliveryEvent } from '../utils/deliveries-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatRelative } from '../utils/deliveries-queries'

/** Above this many entries the timeline only shows the most recent ones until expanded. */
const COLLAPSED_LIMIT = 8

const KNOWN_EVENT_TYPES = [
  'CREATED',
  'BROADCAST',
  'OFFERED',
  'OFFER_DECLINED',
  'OFFER_EXPIRED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'REASSIGNED',
  'ORDER_CANCELLED',
  'SELF_DELIVERED',
  'ASSIGNED_BY_ADMIN',
]

interface DeliveryTimelineProps {
  events: DeliveryEvent[]
  /** Used to resolve the courier name behind an `OFFERED` event when it is in the current list. */
  candidates: CourierCandidate[]
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/** Human label for one event; unknown types fall back to the raw type. */
function eventLabel(t: TFunction, event: DeliveryEvent, candidates: CourierCandidate[]): string {
  const payload = event.payload ?? {}
  if (!KNOWN_EVENT_TYPES.includes(event.type))
    return event.type

  if (event.type === 'BROADCAST') {
    const count = asNumber(payload.notifiedCouriers)
    const radius = asNumber(payload.radiusKm)
    if (count !== undefined && radius !== undefined)
      return t('admin.deliveries.events.BROADCAST_withRadius', { count, radius })
    if (count !== undefined)
      return t('admin.deliveries.events.BROADCAST_withCount', { count })
    return t('admin.deliveries.events.BROADCAST')
  }

  const label = t(`admin.deliveries.events.${event.type}`, { round: asNumber(payload.round) ?? 1 })
  if (event.type === 'OFFERED') {
    // The payload carries the name since 2026-09-10; older events fall back to the candidate list.
    const fromPayload = typeof payload.courierName === 'string' ? payload.courierName : null
    const fromCandidates = typeof payload.courierId === 'string'
      ? candidates.find(candidate => candidate.id === payload.courierId)?.fullName ?? null
      : null
    const name = fromPayload ?? fromCandidates
    if (name)
      return `${label} — ${name}`
  }
  return label
}

export function DeliveryTimeline({ events, candidates }: DeliveryTimelineProps) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // Oldest first so the newest entry sits at the bottom.
  const ordered = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const collapsible = ordered.length > COLLAPSED_LIMIT
  const visible = collapsible && !expanded ? ordered.slice(-COLLAPSED_LIMIT) : ordered

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{t('admin.deliveries.assignPage.timeline')}</CardTitle>
        {collapsible && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(value => !value)}>
            {expanded ? t('common.hide') : t('admin.deliveries.events.showAll', { count: ordered.length })}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {visible.length === 0
          ? <p className="text-sm text-muted-foreground">—</p>
          : (
              <div className="space-y-0">
                {visible.map((event, index) => {
                  const absolute = new Date(event.occurredAt).toLocaleString(i18n.language, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                  const relative = formatRelative(event.occurredAt, i18n.language)
                  return (
                    <div key={`${event.type}-${event.occurredAt}`} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="size-2.5 shrink-0 rounded-full border-2 border-primary bg-primary" />
                        {index < visible.length - 1 && (
                          <div className="min-h-5 w-0.5 flex-1 bg-primary" />
                        )}
                      </div>
                      <div className="pb-3">
                        <p className="text-xs font-medium">{eventLabel(t, event, candidates)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {relative ? `${relative} · ${absolute}` : absolute}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
      </CardContent>
    </Card>
  )
}
