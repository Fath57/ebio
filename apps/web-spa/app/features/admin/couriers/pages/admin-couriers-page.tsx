import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { fetchAdminCouriersQueryOptions } from '../utils/couriers-queries'

const STATUS_OPTIONS = ['ALL', 'PENDING', 'VALIDATED', 'REJECTED', 'SUSPENDED']

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  VALIDATED: 'default',
  REJECTED: 'destructive',
  SUSPENDED: 'destructive',
}

export default function AdminCouriersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery(
    fetchAdminCouriersQueryOptions({
      status: status === 'ALL' ? undefined : status,
      page,
    }),
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.couriers.title')}</h2>
          <p className="text-muted-foreground">{t('admin.couriers.description')}</p>
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t('admin.couriers.filterByStatus')} />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(option => (
              <SelectItem key={option} value={option}>
                {t(`admin.couriers.statuses.${option.toLowerCase()}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.couriers.columns.name')}</TableHead>
            <TableHead>{t('admin.couriers.columns.phone')}</TableHead>
            <TableHead>{t('admin.couriers.columns.vehicle')}</TableHead>
            <TableHead>{t('admin.couriers.columns.zone')}</TableHead>
            <TableHead>{t('admin.couriers.columns.status')}</TableHead>
            <TableHead>{t('admin.couriers.columns.submittedAt')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.couriers?.map(courier => (
            <TableRow
              key={courier.id}
              className="cursor-pointer"
              onClick={() => navigate(`/admin/livreurs/${courier.id}`)}
            >
              <TableCell className="font-medium">{courier.fullName}</TableCell>
              <TableCell>{courier.phone}</TableCell>
              <TableCell>{t(`admin.couriers.vehicles.${courier.vehicleType.toLowerCase()}`)}</TableCell>
              <TableCell className="max-w-xs truncate">{courier.zone}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANTS[courier.validationStatus] ?? 'outline'}>
                  {t(`admin.couriers.statuses.${courier.validationStatus.toLowerCase()}`)}
                </Badge>
              </TableCell>
              <TableCell>{new Date(courier.createdAt).toLocaleDateString('fr-FR')}</TableCell>
            </TableRow>
          ))}
          {(data?.couriers?.length ?? 0) === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t('admin.couriers.empty')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            {t('admin.couriers.pagination.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page}
            {' / '}
            {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            {t('admin.couriers.pagination.next')}
          </Button>
        </div>
      )}
    </div>
  )
}
