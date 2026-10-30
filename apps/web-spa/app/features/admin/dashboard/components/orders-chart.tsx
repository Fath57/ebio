import type { DashboardDay } from '../utils/dashboard-queries'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCount, formatFcfa } from '../utils/format'

interface OrdersChartProps {
  days: DashboardDay[]
}

/** Gridlines at these fractions of the scale: enough to read a bar, quiet enough to ignore. */
const GRID_STEPS = [0.5, 1]

/**
 * Orders per day over the period — one series, so no legend: the card title
 * names it. Bars grow from the baseline with a rounded top; hovering a day
 * shows its orders and order value. A hidden table carries the same figures
 * for screen readers.
 */
export function OrdersChart({ days }: OrdersChartProps) {
  const { t, i18n } = useTranslation()
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(1, ...days.map(day => day.orders))
  // Round the scale up to a whole number of orders so the gridline labels read cleanly.
  const scale = max <= 4 ? max : Math.ceil(max / 2) * 2
  const total = days.reduce((sum, day) => sum + day.orders, 0)

  const formatDay = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, options)

  if (total === 0) {
    return (
      <div className="text-muted-foreground flex h-56 items-center justify-center rounded-lg border border-dashed text-sm">
        {t('admin.dashboard.chart.empty')}
      </div>
    )
  }

  const active = hovered !== null ? days[hovered] : undefined
  const labelIndexes = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])

  return (
    <div>
      <div className="relative h-56 pl-8" onMouseLeave={() => setHovered(null)}>
        {GRID_STEPS.map(step => (
          <div
            key={step}
            className="border-muted-foreground/15 pointer-events-none absolute right-0 left-8 border-t"
            style={{ bottom: `${step * 100}%` }}
          >
            <span className="text-muted-foreground absolute -top-2 -left-8 w-6 text-right text-xs tabular-nums">
              {formatCount(Math.round(scale * step), i18n.language)}
            </span>
          </div>
        ))}
        <div className="border-muted-foreground/40 absolute right-0 bottom-0 left-8 border-t" />

        <div className="absolute inset-0 left-8 flex items-end gap-0.5" aria-hidden="true">
          {days.map((day, index) => (
            <div
              key={day.date}
              className="flex h-full min-w-0 flex-1 items-end"
              onMouseEnter={() => setHovered(index)}
            >
              <div
                className={`bg-ebio-green-400 w-full rounded-t transition-opacity ${hovered !== null && hovered !== index ? 'opacity-50' : ''}`}
                style={{ height: day.orders > 0 ? `max(${(day.orders / scale) * 100}%, 3px)` : 0 }}
              />
            </div>
          ))}
        </div>

        {active && hovered !== null && (
          <div
            className={`bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 w-max rounded-lg border px-3 py-2 text-sm shadow-md ${tooltipShift(hovered, days.length)}`}
            style={{ left: `calc(2rem + (100% - 2rem) * ${(hovered + 0.5) / days.length})` }}
          >
            <p className="font-medium">{formatDay(active.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="text-muted-foreground">
              {t('admin.dashboard.chart.orders', { count: active.orders })}
              {' · '}
              <span className="font-mono">{formatFcfa(active.gmv, i18n.language)}</span>
            </p>
          </div>
        )}
      </div>

      <div className="text-muted-foreground relative mt-2 h-4 pl-8 text-xs" aria-hidden="true">
        {days.map((day, index) => labelIndexes.has(index) && (
          <span
            key={day.date}
            className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
            style={{ left: `calc(2rem + (100% - 2rem) * ${index === 0 ? 0 : index === days.length - 1 ? 1 : (index + 0.5) / days.length})` }}
          >
            {formatDay(day.date, { day: 'numeric', month: 'short' })}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{t('admin.dashboard.chart.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('admin.dashboard.chart.day')}</th>
            <th scope="col">{t('admin.dashboard.kpis.orders')}</th>
            <th scope="col">{t('admin.dashboard.kpis.gmv')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map(day => (
            <tr key={day.date}>
              <td>{formatDay(day.date, { day: 'numeric', month: 'long' })}</td>
              <td>{day.orders}</td>
              <td>{formatFcfa(day.gmv, i18n.language)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Keeps the tooltip inside the card: anchored left near the start, right near the end. */
function tooltipShift(index: number, count: number): string {
  const position = (index + 0.5) / count
  if (position < 0.2)
    return 'translate-x-0'
  if (position > 0.8)
    return '-translate-x-full'
  return '-translate-x-1/2'
}
