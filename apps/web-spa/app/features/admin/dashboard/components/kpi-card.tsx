import { cn } from '@boilerstone/ui/lib/utils'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { relativeChange } from '../utils/format'

interface KpiCardProps {
  label: string
  value: string
  current: number
  previous: number
  /** Where the figure comes from: the whole card leads there. */
  to?: string
  /** For a figure where less is better (cancellations), a fall reads as good news. */
  lowerIsBetter?: boolean
  isLoading?: boolean
}

/**
 * One headline figure of the period and how it moved against the period
 * before. The trend carries an arrow and a sign, not only a colour.
 */
export function KpiCard({ label, value, current, previous, to, lowerIsBetter = false, isLoading = false }: KpiCardProps) {
  const { t, i18n } = useTranslation()
  const change = relativeChange(current, previous)
  const good = change !== null && change !== 0 && (change > 0) !== lowerIsBetter

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        {to && <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-colors" />}
      </div>
      {isLoading
        ? <span className="bg-muted mt-2 block h-8 w-32 animate-pulse rounded-md" />
        : <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{value}</p>}
      <p className="mt-1 flex items-center gap-1 text-sm">
        {isLoading
          ? <span className="bg-muted block h-4 w-24 animate-pulse rounded" />
          : change === null
            ? <span className="text-muted-foreground">{t('admin.dashboard.noComparison')}</span>
            : (
                <>
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 font-medium tabular-nums',
                      change === 0 && 'text-muted-foreground',
                      change !== 0 && (good ? 'text-ebio-green-600 dark:text-ebio-green-200' : 'text-ebio-coral-600 dark:text-ebio-coral-200'),
                    )}
                  >
                    {change > 0 && <ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
                    {change < 0 && <ArrowDownRight className="h-4 w-4" aria-hidden="true" />}
                    {change.toLocaleString(i18n.language, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' })}
                  </span>
                  <span className="text-muted-foreground">{t('admin.dashboard.vsPrevious')}</span>
                </>
              )}
      </p>
    </>
  )

  const className = 'bg-card block rounded-xl border p-5'
  if (!to)
    return <div className={className}>{body}</div>
  return (
    <Link
      to={to}
      className={cn(className, 'group hover:border-primary focus-visible:ring-primary transition-colors focus-visible:ring-2 focus-visible:outline-none')}
    >
      {body}
    </Link>
  )
}
