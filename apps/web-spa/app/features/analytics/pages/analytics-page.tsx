import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchAnalyticsQueryOptions,
  fetchRatingsOverviewQueryOptions,
  fetchTopProductsQueryOptions,
} from '../utils/analytics-queries'

const PERIODS = ['week', 'month', 'quarter']

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState('month')

  const { data: analytics, isLoading: isLoadingAnalytics } = useQuery(fetchAnalyticsQueryOptions(period))
  const { data: topProducts, isLoading: isLoadingProducts } = useQuery(fetchTopProductsQueryOptions(period))
  const { data: ratings, isLoading: isLoadingRatings } = useQuery(fetchRatingsOverviewQueryOptions())

  if (isLoadingAnalytics) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('analytics.title')}</h2>
          <p className="text-muted-foreground">{t('analytics.description')}</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map(p => (
              <SelectItem key={p} value={p}>
                {t(`analytics.period.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('analytics.revenue')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {analytics?.revenue ?? 0}
              {' '}
              {t('analytics.currency')}
            </p>
            {analytics?.revenueTrend != null && (
              <p className={`text-sm ${analytics.revenueTrend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {analytics.revenueTrend >= 0 ? '+' : ''}
                {analytics.revenueTrend}
                %
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('analytics.ordersCount')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics?.ordersCount ?? 0}</p>
            {analytics?.ordersTrend != null && (
              <p className={`text-sm ${analytics.ordersTrend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {analytics.ordersTrend >= 0 ? '+' : ''}
                {analytics.ordersTrend}
                %
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('analytics.averageOrder')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {analytics?.averageOrder ?? 0}
              {' '}
              {t('analytics.currency')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.topProducts')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingProducts
            ? <Skeleton className="h-32 w-full" />
            : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('analytics.columns.product')}</TableHead>
                      <TableHead>{t('analytics.columns.quantitySold')}</TableHead>
                      <TableHead>{t('analytics.columns.revenue')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts?.data?.map(product => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.quantitySold}</TableCell>
                        <TableCell>
                          {product.revenue}
                          {' '}
                          {t('analytics.currency')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('analytics.ratingsOverview')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingRatings
            ? <Skeleton className="h-20 w-full" />
            : (
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-4xl font-bold">{ratings?.average?.toFixed(1) ?? '0.0'}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${i < Math.round(ratings?.average ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {ratings?.totalCount ?? 0}
                      {' '}
                      {t('analytics.reviews')}
                    </p>
                  </div>
                  <div className="flex-1 space-y-1">
                    {[5, 4, 3, 2, 1].map(star => (
                      <div key={star} className="flex items-center gap-2">
                        <span className="text-sm w-3">{star}</span>
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-yellow-400 rounded-full"
                            style={{ width: `${ratings?.distribution?.[star] ?? 0}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-8">
                          {ratings?.distribution?.[star] ?? 0}
                          %
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
        </CardContent>
      </Card>
    </div>
  )
}
