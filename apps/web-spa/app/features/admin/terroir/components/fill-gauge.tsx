import type { ExportFill } from '../utils/terroir-types'
import { cn } from '@boilerstone/ui/lib/utils'
import { useTranslation } from 'react-i18next'
import { formatKgValue, formatRatio } from '../utils/terroir-format'

/** At 80 % the team is warned (FR-020): the bar turns earth to say « bientôt plein ». */
const ALERT_RATIO = 0.8

/**
 * How full a departure is: a bar and the kilos in words, « 82,4 / 100 kg ».
 * Without a negotiated capacity there is nothing to fill: only the kilos.
 */
export function FillGauge({ fill, className }: { fill: ExportFill, className?: string }) {
  const { t } = useTranslation()
  const reserved = formatKgValue(fill.reservedKg)

  if (fill.capacityKg == null) {
    return (
      <p className={cn('text-sm', className)}>
        {t('admin.terroir.fill.noCapacity', { reserved })}
      </p>
    )
  }

  const ratio = fill.ratio ?? (fill.capacityKg > 0 ? fill.reservedKg / fill.capacityKg : 0)
  const width = Math.min(Math.max(ratio, 0), 1) * 100
  const barClass = ratio >= 1
    ? 'bg-ebio-earth-600'
    : ratio >= ALERT_RATIO ? 'bg-ebio-earth-400' : 'bg-ebio-green-400'
  const label = t('admin.terroir.fill.text', { reserved, capacity: formatKgValue(fill.capacityKg) })

  return (
    <div className={cn('min-w-36 space-y-1', className)}>
      <div
        role="meter"
        aria-label={t('admin.terroir.fill.label')}
        aria-valuemin={0}
        aria-valuemax={fill.capacityKg}
        aria-valuenow={fill.reservedKg}
        aria-valuetext={label}
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
      >
        <div className={cn('h-full rounded-full transition-all', barClass)} style={{ width: `${width}%` }} />
      </div>
      <p className="text-xs whitespace-nowrap">
        <span className="font-mono font-medium">{label}</span>
        <span className="text-muted-foreground">{` · ${formatRatio(ratio)}`}</span>
      </p>
    </div>
  )
}
