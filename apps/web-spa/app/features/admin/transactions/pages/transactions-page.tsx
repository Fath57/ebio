import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { DatePicker } from '@boilerstone/ui/components/primitives/date-picker'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { Separator } from '@boilerstone/ui/components/primitives/separator'
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
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Can } from '@/lib/casl/can'
import {
  exportTransactionsCsvUrl,
  fetchDisputesQueryOptions,
  fetchTransactionsQueryOptions,
} from '../utils/transactions-queries'

export default function TransactionsPage() {
  const { t } = useTranslation()
  const [fromDate, setFromDate] = useState<Date | undefined>()
  const [toDate, setToDate] = useState<Date | undefined>()

  const dateParams = {
    from: fromDate ? format(fromDate, 'yyyy-MM-dd') : undefined,
    to: toDate ? format(toDate, 'yyyy-MM-dd') : undefined,
  }

  const { data: transactions, isLoading: isLoadingTransactions } = useQuery(
    fetchTransactionsQueryOptions(dateParams),
  )

  const { data: disputes, isLoading: isLoadingDisputes } = useQuery(
    fetchDisputesQueryOptions(),
  )

  const handleExport = () => {
    window.open(exportTransactionsCsvUrl(dateParams), '_blank')
  }

  if (isLoadingTransactions) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.transactions.title')}</h2>
          <p className="text-muted-foreground">{t('admin.transactions.description')}</p>
        </div>
        <Can action="read" subject="Payment">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            {t('admin.transactions.exportCsv')}
          </Button>
        </Can>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label>{t('admin.transactions.from')}</Label>
          <DatePicker
            value={fromDate}
            onChange={setFromDate}
            placeholder={t('admin.transactions.from')}
            dateFormat="dd/MM/yyyy"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label>{t('admin.transactions.to')}</Label>
          <DatePicker
            value={toDate}
            onChange={setToDate}
            placeholder={t('admin.transactions.to')}
            dateFormat="dd/MM/yyyy"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.transactions.columns.reference')}</TableHead>
            <TableHead>{t('admin.transactions.columns.buyer')}</TableHead>
            <TableHead>{t('admin.transactions.columns.supplier')}</TableHead>
            <TableHead>{t('admin.transactions.columns.amount')}</TableHead>
            <TableHead>{t('admin.transactions.columns.commission')}</TableHead>
            <TableHead>{t('admin.transactions.columns.date')}</TableHead>
            <TableHead>{t('admin.transactions.columns.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions?.data?.map(tx => (
            <TableRow key={tx.id}>
              <TableCell className="font-medium">
                #
                {tx.reference || tx.id.slice(0, 8)}
              </TableCell>
              <TableCell>{tx.buyerName}</TableCell>
              <TableCell>{tx.supplierName}</TableCell>
              <TableCell>
                {tx.amount}
                {' '}
                {t('admin.transactions.currency')}
              </TableCell>
              <TableCell>
                {tx.commission}
                {' '}
                {t('admin.transactions.currency')}
              </TableCell>
              <TableCell>{new Date(tx.createdAt).toLocaleDateString()}</TableCell>
              <TableCell>
                <Badge variant={tx.status === 'COMPLETED' ? 'default' : 'outline'}>
                  {t(`admin.transactions.status.${tx.status.toLowerCase()}`)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('admin.transactions.disputes.title')}</h3>
        {isLoadingDisputes
          ? <Skeleton className="h-32 w-full" />
          : (
              <div className="space-y-3">
                {disputes?.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('admin.transactions.disputes.noDisputes')}</p>
                )}
                {disputes?.data?.map(dispute => (
                  <Card key={dispute.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>
                          {t('admin.transactions.disputes.dispute')}
                          {' '}
                          #
                          {dispute.id.slice(0, 8)}
                        </span>
                        <Badge variant="destructive">{t(`admin.transactions.disputes.status.${dispute.status.toLowerCase()}`)}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{dispute.reason}</p>
                      <p className="text-sm mt-1">
                        <span className="font-medium">
                          {t('admin.transactions.disputes.amount')}
                          :
                          {' '}
                        </span>
                        {dispute.amount}
                        {' '}
                        {t('admin.transactions.currency')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
      </div>
    </div>
  )
}
