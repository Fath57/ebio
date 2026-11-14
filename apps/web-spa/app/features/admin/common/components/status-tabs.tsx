import type { StatusTone } from './status-badge'
import { cn } from '@boilerstone/ui/lib/utils'
import { useTranslation } from 'react-i18next'

export interface StatusTab {
  /** Status sent to the API; `''` is the unfiltered tab. */
  value: string
  label: string
  tone?: StatusTone
}

interface StatusTabsProps {
  tabs: StatusTab[]
  value: string
  onChange: (value: string) => void
  /** Rows per status under the other filters; undefined while the first page loads. */
  counts?: Record<string, number>
  /** Lead with an « All » tab, totalled from the others (default). Off for tabs that are sections. */
  allTab?: boolean
}

/**
 * Count pills that ask for attention: a queue someone must clear (earth) or
 * a problem (coral). Everything else stays quiet, so the eye goes where the work is.
 */
const LOUD_COUNT: Partial<Record<StatusTone, string>> = {
  // Earth 600, not 400: white on earth 400 stays under 4.5:1.
  action: 'bg-ebio-earth-600 text-white',
  problem: 'bg-ebio-coral-600 text-white dark:bg-ebio-coral-400 dark:text-ebio-neutral-900',
}

/**
 * The statuses of a list as tabs, each with how many rows it holds, the
 * first thing to read on a back-office list is where the work is waiting.
 * An "All" tab leads, totalled from the others.
 */
export function StatusTabs({ tabs, value, onChange, counts, allTab = true }: StatusTabsProps) {
  const { t, i18n } = useTranslation()
  const total = counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : undefined
  const allTabs: StatusTab[] = allTab ? [{ value: '', label: t('dataTable.allTab') }, ...tabs] : tabs

  return (
    <div className="border-b">
      <div role="tablist" aria-label={t('dataTable.statusTabs')} className="-mb-px flex gap-1 overflow-x-auto">
        {allTabs.map((tab) => {
          const active = tab.value === value
          // A status tab with no row counts 0; a section tab nobody counts shows no pill at all.
          const count = tab.value === ''
            ? total
            : counts && tab.value in counts ? counts[tab.value] : (allTab && counts ? 0 : undefined)
          const loud = count && tab.tone ? LOUD_COUNT[tab.tone] : undefined
          return (
            <button
              key={tab.value || 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                'focus-visible:ring-primary inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                active
                  ? 'border-primary text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
              onClick={() => onChange(tab.value)}
            >
              {tab.label}
              {count !== undefined && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums',
                    loud ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {count.toLocaleString(i18n.language)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
