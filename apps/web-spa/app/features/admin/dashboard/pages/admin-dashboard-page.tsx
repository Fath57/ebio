import { adminControllerGetDashboard } from '@boilerstone/openapi-generator/client/sdk.gen'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KpiCard } from '../components/kpi-card'

interface AdminDashboardData {
  activeUsers: number
  activeUsersTrend: number
  suppliers: number
  suppliersTrend: number
  searchesPerDay: number
  searchesTrend: number
  transactions: number
  transactionsTrend: number
  revenue: number
  revenueTrend: number
  pendingValidations: number
  disputes: number
}

function fetchAdminKpisQueryOptions() {
  return {
    queryKey: ['admin', 'kpis'],
    queryFn: async () => {
      const response = await adminControllerGetDashboard()
      if (response.error)
        throw new Error('Failed to fetch admin KPIs')
      return response.data as AdminDashboardData
    },
  }
}

export default function AdminDashboardPage() {
  const { t } = useTranslation()
  const { data: kpis, isLoading } = useQuery(fetchAdminKpisQueryOptions())

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('admin.dashboard.title')}</h2>
        <p className="text-muted-foreground">{t('admin.dashboard.description')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t('admin.dashboard.kpis.activeUsers')}
          value={kpis?.activeUsers ?? 0}
          trend={kpis?.activeUsersTrend}
        />
        <KpiCard
          label={t('admin.dashboard.kpis.suppliers')}
          value={kpis?.suppliers ?? 0}
          trend={kpis?.suppliersTrend}
        />
        <KpiCard
          label={t('admin.dashboard.kpis.searchesPerDay')}
          value={kpis?.searchesPerDay ?? 0}
          trend={kpis?.searchesTrend}
        />
        <KpiCard
          label={t('admin.dashboard.kpis.transactions')}
          value={kpis?.transactions ?? 0}
          trend={kpis?.transactionsTrend}
        />
        <KpiCard
          label={t('admin.dashboard.kpis.revenue')}
          value={`${kpis?.revenue ?? 0} ${t('admin.dashboard.currency')}`}
          trend={kpis?.revenueTrend}
        />
        <KpiCard
          label={t('admin.dashboard.kpis.pendingValidations')}
          value={kpis?.pendingValidations ?? 0}
          isAlert={(kpis?.pendingValidations ?? 0) > 0}
        />
        <KpiCard
          label={t('admin.dashboard.kpis.disputes')}
          value={kpis?.disputes ?? 0}
          isAlert={(kpis?.disputes ?? 0) > 0}
        />
      </div>
    </div>
  )
}
