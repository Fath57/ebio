import type { AdminPayoutNumber, AdminWithdrawal } from '../utils/withdrawals-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  actOnPayoutNumber,
  actOnWithdrawal,
  fetchAdminWithdrawalsQueryOptions,
  fetchPayoutNumbersQueryOptions,
  fetchWalletsOverviewQueryOptions,
} from '../utils/withdrawals-queries'

const WITHDRAWAL_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  PROCESSING: 'secondary',
  PAID: 'default',
  FAILED: 'destructive',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

/** Reject dialog shared by numbers and withdrawals: the reason is mandatory. */
interface RejectTarget {
  kind: 'number' | 'withdrawal'
  id: string
  label: string
}

export default function AdminWithdrawalsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approveError, setApproveError] = useState<string | null>(null)

  const { data: pendingNumbers, isLoading: isLoadingNumbers } = useQuery(
    fetchPayoutNumbersQueryOptions('PENDING', 1),
  )
  const { data: withdrawals, isLoading: isLoadingWithdrawals } = useQuery(
    fetchAdminWithdrawalsQueryOptions(undefined, 1),
  )
  const { data: overview, isLoading: isLoadingOverview } = useQuery(fetchWalletsOverviewQueryOptions())

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'payout-numbers'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'withdrawals'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] })
  }

  const numberAction = useMutation({
    mutationFn: ({ id, action, reason }: { id: string, action: 'validate' | 'reject', reason?: string }) =>
      actOnPayoutNumber(id, action, reason),
    onSuccess: () => {
      setRejectTarget(null)
      setRejectReason('')
      invalidate()
    },
  })

  const withdrawalAction = useMutation({
    mutationFn: ({ id, action, reason }: { id: string, action: 'approve' | 'reject', reason?: string }) =>
      actOnWithdrawal(id, action, reason),
    onSuccess: () => {
      setRejectTarget(null)
      setRejectReason('')
      setApproveError(null)
      invalidate()
    },
    // A failed payout re-credits the supplier automatically; surface why.
    onError: (error: Error) => {
      setApproveError(error.message)
      invalidate()
    },
  })

  const isActing = numberAction.isPending || withdrawalAction.isPending

  const submitReject = () => {
    if (!rejectTarget || rejectReason.trim().length < 3)
      return
    if (rejectTarget.kind === 'number')
      numberAction.mutate({ id: rejectTarget.id, action: 'reject', reason: rejectReason.trim() })
    else
      withdrawalAction.mutate({ id: rejectTarget.id, action: 'reject', reason: rejectReason.trim() })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('admin.withdrawals.title')}</h2>
        <p className="text-muted-foreground">{t('admin.withdrawals.description')}</p>
      </div>

      {approveError && (
        <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {approveError}
        </p>
      )}

      {/* Balances overview */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t('admin.withdrawals.totalOwed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingOverview
              ? <Skeleton className="h-8 w-32" />
              : <p className="text-primary text-2xl font-bold">{formatAmount(overview?.totalOwed ?? 0)}</p>}
            <p className="text-muted-foreground mt-1 text-xs">{t('admin.withdrawals.totalOwedHint')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {t('admin.withdrawals.totalDebt')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingOverview
              ? <Skeleton className="h-8 w-32" />
              : <p className="text-2xl font-bold">{formatAmount(overview?.totalDebt ?? 0)}</p>}
            <p className="text-muted-foreground mt-1 text-xs">{t('admin.withdrawals.totalDebtHint')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Payout numbers to validate */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.withdrawals.numbersTitle')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('admin.withdrawals.numbersHint')}</p>
        </CardHeader>
        <CardContent>
          {isLoadingNumbers
            ? <Skeleton className="h-24 w-full" />
            : (pendingNumbers?.items.length ?? 0) === 0
                ? <p className="text-muted-foreground py-4 text-center text-sm">{t('admin.withdrawals.numbersEmpty')}</p>
                : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('admin.withdrawals.columns.shop')}</TableHead>
                          <TableHead>{t('admin.withdrawals.columns.number')}</TableHead>
                          <TableHead>{t('admin.withdrawals.columns.operator')}</TableHead>
                          <TableHead>{t('admin.withdrawals.columns.holder')}</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingNumbers?.items.map((number: AdminPayoutNumber) => (
                          <TableRow key={number.id}>
                            <TableCell>
                              <Link to={`/admin/fournisseurs/${number.supplierId}`} className="font-medium hover:underline">
                                {number.shopName}
                              </Link>
                            </TableCell>
                            <TableCell className="font-mono">{number.phoneNumber}</TableCell>
                            <TableCell>{number.operatorLabel}</TableCell>
                            <TableCell>{number.holderName}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isActing}
                                onClick={() => numberAction.mutate({ id: number.id, action: 'validate' })}
                              >
                                <CheckCircle2 className="mr-1 h-4 w-4 text-green-600" />
                                {t('admin.withdrawals.validate')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isActing}
                                onClick={() => setRejectTarget({ kind: 'number', id: number.id, label: number.phoneNumber })}
                              >
                                <XCircle className="text-destructive mr-1 h-4 w-4" />
                                {t('admin.withdrawals.reject')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
        </CardContent>
      </Card>

      {/* Withdrawal requests */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.withdrawals.requestsTitle')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('admin.withdrawals.requestsHint')}</p>
        </CardHeader>
        <CardContent>
          {isLoadingWithdrawals
            ? <Skeleton className="h-24 w-full" />
            : (withdrawals?.items.length ?? 0) === 0
                ? <p className="text-muted-foreground py-4 text-center text-sm">{t('admin.withdrawals.requestsEmpty')}</p>
                : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('admin.withdrawals.columns.date')}</TableHead>
                          <TableHead>{t('admin.withdrawals.columns.shop')}</TableHead>
                          <TableHead>{t('admin.withdrawals.columns.number')}</TableHead>
                          <TableHead className="text-right">{t('admin.withdrawals.columns.amount')}</TableHead>
                          <TableHead>{t('admin.withdrawals.columns.status')}</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withdrawals?.items.map((withdrawal: AdminWithdrawal) => (
                          <TableRow key={withdrawal.id}>
                            <TableCell>{new Date(withdrawal.createdAt).toLocaleDateString(i18n.language)}</TableCell>
                            <TableCell>
                              <Link to={`/admin/fournisseurs/${withdrawal.supplierId}`} className="font-medium hover:underline">
                                {withdrawal.shopName}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono">{withdrawal.phoneNumber}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{withdrawal.operatorLabel}</span>
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatAmount(withdrawal.amount)}</TableCell>
                            <TableCell>
                              <Badge variant={WITHDRAWAL_VARIANTS[withdrawal.status] ?? 'outline'}>
                                {t(`admin.withdrawals.status.${withdrawal.status}`)}
                              </Badge>
                              {withdrawal.rejectionReason && (
                                <p className="text-muted-foreground mt-1 text-xs">{withdrawal.rejectionReason}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {withdrawal.status === 'PENDING' && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={isActing}
                                    onClick={() => withdrawalAction.mutate({ id: withdrawal.id, action: 'approve' })}
                                  >
                                    {t('admin.withdrawals.approve')}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isActing}
                                    onClick={() => setRejectTarget({
                                      kind: 'withdrawal',
                                      id: withdrawal.id,
                                      label: `${formatAmount(withdrawal.amount)} — ${withdrawal.shopName}`,
                                    })}
                                  >
                                    {t('admin.withdrawals.reject')}
                                  </Button>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={rejectTarget !== null} onOpenChange={open => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('admin.withdrawals.rejectTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.withdrawals.rejectBody', { label: rejectTarget?.label ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            placeholder={t('admin.withdrawals.rejectPlaceholder')}
            onChange={event => setRejectReason(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={isActing || rejectReason.trim().length < 3}
              onClick={submitReject}
            >
              {t('admin.withdrawals.reject')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
