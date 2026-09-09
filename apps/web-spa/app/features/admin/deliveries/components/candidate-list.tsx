import type { CourierCandidate } from '../utils/deliveries-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CourierRating } from '../../couriers/components/courier-rating'
import { formatRelative } from '../utils/deliveries-queries'

interface CandidateListProps {
  candidates: CourierCandidate[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (courierId: string | null) => void
  onAssign: (candidate: CourierCandidate) => void
  assignDisabled: boolean
}

export function CandidateList({ candidates, isLoading, selectedId, onSelect, onAssign, assignDisabled }: CandidateListProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (candidates.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        {t('admin.deliveries.assignPage.noCandidates')}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {candidates.map(candidate => (
        <CandidateRow
          key={candidate.id}
          candidate={candidate}
          selected={candidate.id === selectedId}
          onSelect={onSelect}
          onAssign={onAssign}
          assignDisabled={assignDisabled}
        />
      ))}
    </ul>
  )
}

interface CandidateRowProps {
  candidate: CourierCandidate
  selected: boolean
  onSelect: (courierId: string | null) => void
  onAssign: (candidate: CourierCandidate) => void
  assignDisabled: boolean
}

function CandidateRow({ candidate, selected, onSelect, onAssign, assignDisabled }: CandidateRowProps) {
  const { t, i18n } = useTranslation()
  const ref = useRef<HTMLLIElement>(null)

  // A marker click on the map brings its row into view.
  useEffect(() => {
    if (selected)
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  const positionLabel = candidate.positionSource === 'GPS'
    ? t('admin.deliveries.assignPage.seen', { ago: formatRelative(candidate.lastLocationAt, i18n.language) ?? '' })
    : candidate.positionSource === 'ZONE'
      ? t('admin.deliveries.assignPage.zoneCenter')
      : t('admin.deliveries.assignPage.noPosition')

  return (
    <li
      ref={ref}
      className={`rounded-lg border p-3 transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => onSelect(selected ? null : candidate.id)}
        aria-pressed={selected}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{candidate.fullName}</span>
            <Badge variant={candidate.isAvailable ? 'default' : 'outline'}>
              {t(`admin.deliveries.assignPage.${candidate.isAvailable ? 'online' : 'offline'}`)}
            </Badge>
            {candidate.isCurrent && (
              <Badge variant="secondary">{t('admin.deliveries.assignPage.current')}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(`admin.couriers.vehicles.${candidate.vehicleType.toLowerCase()}`)}
            {' · '}
            {candidate.phone}
            {' · '}
            {candidate.zone}
          </p>
          <p className="text-xs text-muted-foreground">
            {positionLabel}
            {' · '}
            {t('admin.deliveries.assignPage.active', { count: candidate.activeDeliveries })}
            {' · '}
            {t('admin.deliveries.assignPage.delivered', { count: candidate.deliveredCount })}
            {candidate.ratingCount > 0 && (
              <>
                {' · '}
                <CourierRating ratingAvg={candidate.ratingAvg} ratingCount={candidate.ratingCount} className="text-foreground" />
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">
            {candidate.distanceKm !== null
              ? t('admin.deliveries.assignPage.distance', { km: candidate.distanceKm.toLocaleString(i18n.language) })
              : '—'}
          </p>
        </div>
      </button>
      {selected && !candidate.isCurrent && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" disabled={assignDisabled} onClick={() => onAssign(candidate)}>
            {t('admin.deliveries.assignPage.assign')}
          </Button>
        </div>
      )}
    </li>
  )
}
