import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { TrendingDown, TrendingUp } from 'lucide-react'
import * as React from 'react'

interface KpiCardProps {
  label: string
  value: string | number
  trend?: number
  isAlert?: boolean
}

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, trend, isAlert }) => {
  const trendColor = isAlert
    ? 'text-red-500'
    : (trend != null && trend >= 0) ? 'text-green-600' : 'text-red-500'

  return (
    <Card className={isAlert ? 'border-red-200' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {trend != null && (
          <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
            {trend >= 0
              ? <TrendingUp className="h-4 w-4" />
              : <TrendingDown className="h-4 w-4" />}
            <span>
              {trend >= 0 ? '+' : ''}
              {trend}
              %
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
