import type { DashboardPeriod } from '../utils/dashboard-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { cn } from '@boilerstone/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { InboxBlock } from '../components/inbox-block'
import { KpiCard } from '../components/kpi-card'
import { OrdersChart } from '../components/orders-chart'
import { DASHBOARD_PERIODS, fetchDashboardQueryOptions, parseDashboardPeriod } from '../utils/dashboard-queries'
import { formatCount, formatFcfa, formatRate } from '../utils/format'

/**
 * The back-office home, read top to bottom in order of urgency: what waits
 * for the staff, then how the period went against the one before, then
 * where the activity comes from.
 */
export default function AdminDashboardPage() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const period = parseDashboardPeriod(params.get('periode'))
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchDashboardQueryOptions(period),
    placeholderData: keepPreviousData,
  })

  const setPeriod = (next: DashboardPeriod) => {
    setParams((previous) => {
      const updated = new URLSearchParams(previous)
      if (next === '30d')
        updated.delete('periode')
      else
        updated.set('periode', next)
      return updated
    }, { replace: true })
  }

  const kpis = data?.kpis
  const locale = i18n.language
  const basket = (orders: number, gmv: number) => (orders > 0 ? gmv / orders : 0)

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">{t('admin.dashboard.title')}</h2>
        <p className="text-muted-foreground first-letter:uppercase">
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <InboxBlock />

      <section className="space-y-4" aria-busy={isFetching}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{t('admin.dashboard.activityTitle')}</h3>
          <div role="radiogroup" aria-label={t('admin.dashboard.periodLabel')} className="bg-muted flex w-full rounded-lg p-1 sm:inline-flex sm:w-auto">
            {DASHBOARD_PERIODS.map(value => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={value === period}
                className={cn(
                  'focus-visible:ring-primary h-9 flex-1 rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none sm:flex-none sm:px-3',
                  value === period ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setPeriod(value)}
              >
                {t(`admin.dashboard.periods.${value}`)}
              </button>
            ))}
          </div>
        </div>

        {isError && !data
          ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border py-12 text-center">
                <AlertTriangle className="text-destructive h-8 w-8" />
                <p className="font-medium">{t('admin.dashboard.error')}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>{t('dataTable.retry')}</Button>
              </div>
            )
          : (
              <div className={cn('space-y-4 transition-opacity', isFetching && !isLoading && 'opacity-60')}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label={t('admin.dashboard.kpis.gmv')}
                    value={formatFcfa(kpis?.gmv.value ?? 0, locale)}
                    current={kpis?.gmv.value ?? 0}
                    previous={kpis?.gmv.previous ?? 0}
                    to="/admin/transactions"
                    isLoading={isLoading}
                  />
                  <KpiCard
                    label={t('admin.dashboard.kpis.orders')}
                    value={formatCount(kpis?.orders.value ?? 0, locale)}
                    current={kpis?.orders.value ?? 0}
                    previous={kpis?.orders.previous ?? 0}
                    to="/admin/commandes"
                    isLoading={isLoading}
                  />
                  <KpiCard
                    label={t('admin.dashboard.kpis.commission')}
                    value={formatFcfa(kpis?.commission.value ?? 0, locale)}
                    current={kpis?.commission.value ?? 0}
                    previous={kpis?.commission.previous ?? 0}
                    to="/admin/commissions"
                    isLoading={isLoading}
                  />
                  <KpiCard
                    label={t('admin.dashboard.kpis.basket')}
                    value={formatFcfa(basket(kpis?.orders.value ?? 0, kpis?.gmv.value ?? 0), locale)}
                    current={basket(kpis?.orders.value ?? 0, kpis?.gmv.value ?? 0)}
                    previous={basket(kpis?.orders.previous ?? 0, kpis?.gmv.previous ?? 0)}
                    isLoading={isLoading}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="bg-card rounded-xl border p-5 lg:col-span-2">
                    <div className="mb-4 space-y-1">
                      <h4 className="font-semibold">{t('admin.dashboard.chart.title')}</h4>
                      <p className="text-muted-foreground text-sm">{t('admin.dashboard.chart.hint')}</p>
                    </div>
                    {isLoading
                      ? <div className="bg-muted h-56 animate-pulse rounded-lg" />
                      : <OrdersChart days={data?.daily ?? []} />}
                  </div>

                  <div className="bg-card rounded-xl border p-5">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <h4 className="font-semibold">{t('admin.dashboard.topSuppliers.title')}</h4>
                      <Link to="/admin/fournisseurs" className="text-primary text-sm font-medium underline-offset-4 hover:underline">
                        {t('admin.dashboard.seeAll')}
                      </Link>
                    </div>
                    {isLoading
                      ? <div className="bg-muted h-56 animate-pulse rounded-lg" />
                      : (data?.topSuppliers.length ?? 0) === 0
                          ? <p className="text-muted-foreground py-12 text-center text-sm">{t('admin.dashboard.topSuppliers.empty')}</p>
                          : (
                              <ol className="space-y-1">
                                {data?.topSuppliers.map((supplier, index) => (
                                  <li key={supplier.id}>
                                    <Link
                                      to={`/admin/fournisseurs/${supplier.id}`}
                                      className="hover:bg-muted/60 focus-visible:ring-primary group flex items-center gap-3 rounded-lg px-2 py-2 focus-visible:ring-2 focus-visible:outline-none"
                                    >
                                      <span className="text-muted-foreground w-4 text-sm tabular-nums">{index + 1}</span>
                                      <span className="min-w-0 flex-1">
                                        <span className="line-clamp-2 font-medium">{supplier.shopName}</span>
                                        <span className="text-muted-foreground text-xs">
                                          {t('admin.dashboard.chart.orders', { count: supplier.orders })}
                                        </span>
                                      </span>
                                      <span className="font-mono text-sm font-medium tabular-nums">{formatFcfa(supplier.gmv, locale)}</span>
                                      <ArrowRight className="text-muted-foreground h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                                    </Link>
                                  </li>
                                ))}
                              </ol>
                            )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard
                    label={t('admin.dashboard.kpis.newBuyers')}
                    value={formatCount(kpis?.newBuyers.value ?? 0, locale)}
                    current={kpis?.newBuyers.value ?? 0}
                    previous={kpis?.newBuyers.previous ?? 0}
                    to="/admin/utilisateurs?role=BUYER"
                    isLoading={isLoading}
                  />
                  <KpiCard
                    label={t('admin.dashboard.kpis.cancellationRate')}
                    value={formatRate(kpis?.cancellationRate.value ?? 0, locale)}
                    current={kpis?.cancellationRate.value ?? 0}
                    previous={kpis?.cancellationRate.previous ?? 0}
                    to="/admin/commandes?statut=CANCELLED"
                    lowerIsBetter
                    isLoading={isLoading}
                  />
                  <PlatformStat
                    label={t('admin.dashboard.kpis.validatedSuppliers')}
                    value={formatCount(data?.platform.validatedSuppliers ?? 0, locale)}
                    to="/admin/fournisseurs?statut=VALIDATED"
                    isLoading={isLoading}
                  />
                  <PlatformStat
                    label={t('admin.dashboard.kpis.validatedCouriers')}
                    value={formatCount(data?.platform.validatedCouriers ?? 0, locale)}
                    hint={t('admin.dashboard.kpis.buyersTotal', { count: data?.platform.buyers ?? 0 })}
                    to="/admin/livreurs?statut=VALIDATED"
                    isLoading={isLoading}
                  />
                </div>
              </div>
            )}
      </section>
    </div>
  )
}

interface PlatformStatProps {
  label: string
  value: string
  to: string
  hint?: string
  isLoading: boolean
}

/** A standing figure of the platform: no period, so no trend. */
function PlatformStat({ label, value, to, hint, isLoading }: PlatformStatProps) {
  const { t } = useTranslation()
  return (
    <Link
      to={to}
      className="group bg-card hover:border-primary focus-visible:ring-primary block rounded-xl border p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-sm font-medium">{label}</p>
        <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-colors" />
      </div>
      {isLoading
        ? <span className="bg-muted mt-2 block h-8 w-20 animate-pulse rounded-md" />
        : <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{value}</p>}
      <p className="text-muted-foreground mt-1 text-sm">{hint ?? t('admin.dashboard.standing')}</p>
    </Link>
  )
}
