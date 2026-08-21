import type { PayoutNumberItem, WithdrawalItem } from '../utils/wallet-queries'
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
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, PlusCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addPayoutNumber,
  cancelWithdrawal,
  fetchPayoutNumbersQueryOptions,
  fetchSupplierWalletQueryOptions,
  fetchWithdrawalsQueryOptions,
  removePayoutNumber,
  requestWithdrawal,
} from '../utils/wallet-queries'

const MIN_WITHDRAWAL = 1000

const MOVEMENT_SIGNS: Record<string, string> = {
  TOPUP: '+',
  SALE_CREDIT: '+',
  WITHDRAWAL_REFUND: '+',
  REFUND: '+',
}

const NUMBER_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive'> = {
  PENDING: 'secondary',
  VALIDATED: 'default',
  REJECTED: 'destructive',
}

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

export default function WalletPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [isAddingNumber, setIsAddingNumber] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [holderName, setHolderName] = useState('')
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawNumberId, setWithdrawNumberId] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: wallet, isLoading } = useQuery(fetchSupplierWalletQueryOptions())
  const { data: numbers } = useQuery(fetchPayoutNumbersQueryOptions())
  const { data: withdrawals } = useQuery(fetchWithdrawalsQueryOptions())

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['supplier', 'wallet'] })
    queryClient.invalidateQueries({ queryKey: ['supplier', 'payout-numbers'] })
    queryClient.invalidateQueries({ queryKey: ['supplier', 'withdrawals'] })
  }

  const onError = (error: Error) => setActionError(error.message)

  const addNumber = useMutation({
    mutationFn: () => addPayoutNumber(phoneNumber, holderName),
    onSuccess: () => {
      setIsAddingNumber(false)
      setPhoneNumber('')
      setHolderName('')
      setActionError(null)
      invalidate()
    },
    onError,
  })

  const removeNumber = useMutation({
    mutationFn: (id: string) => removePayoutNumber(id),
    onSuccess: invalidate,
    onError,
  })

  const withdraw = useMutation({
    mutationFn: () => requestWithdrawal(withdrawNumberId, Number(withdrawAmount)),
    onSuccess: () => {
      setIsWithdrawing(false)
      setWithdrawAmount('')
      setActionError(null)
      invalidate()
    },
    onError,
  })

  const cancel = useMutation({
    mutationFn: (id: string) => cancelWithdrawal(id),
    onSuccess: invalidate,
    onError,
  })

  const validatedNumbers = (numbers ?? []).filter(number => number.status === 'VALIDATED')
  const balance = wallet?.balance ?? 0
  const hasActiveWithdrawal = (withdrawals ?? []).some(
    withdrawal => withdrawal.status === 'PENDING' || withdrawal.status === 'PROCESSING',
  )
  const withdrawAmountNumber = Number(withdrawAmount)
  const isWithdrawValid = withdrawNumberId !== ''
    && !Number.isNaN(withdrawAmountNumber)
    && withdrawAmountNumber >= MIN_WITHDRAWAL
    && withdrawAmountNumber <= balance

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t('wallet.title')}</h2>
        <p className="text-muted-foreground">{t('wallet.description')}</p>
      </div>

      {actionError && (
        <p className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
          {actionError}
        </p>
      )}

      {/* Balance + withdraw CTA */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <p className="text-muted-foreground text-sm">{t('wallet.balance')}</p>
            <p className={`text-3xl font-bold ${balance < 0 ? 'text-destructive' : ''}`}>
              {formatAmount(balance)}
            </p>
            {balance < 0 && (
              <p className="text-muted-foreground mt-1 text-xs">{t('wallet.negativeHint')}</p>
            )}
          </div>
          <Button
            disabled={balance < MIN_WITHDRAWAL || validatedNumbers.length === 0 || hasActiveWithdrawal}
            onClick={() => {
              setWithdrawNumberId(validatedNumbers[0]?.id ?? '')
              setIsWithdrawing(true)
            }}
          >
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            {t('wallet.withdraw')}
          </Button>
        </CardContent>
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-xs">
            {hasActiveWithdrawal
              ? t('wallet.activeWithdrawalHint')
              : validatedNumbers.length === 0
                ? t('wallet.noValidatedNumberHint')
                : t('wallet.withdrawHint', { min: MIN_WITHDRAWAL.toLocaleString('fr-FR') })}
          </p>
        </CardContent>
      </Card>

      {/* Payout numbers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t('wallet.numbersTitle')}</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">{t('wallet.numbersHint')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsAddingNumber(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('wallet.addNumber')}
          </Button>
        </CardHeader>
        <CardContent>
          {(numbers ?? []).length === 0
            ? <p className="text-muted-foreground py-2 text-sm">{t('wallet.numbersEmpty')}</p>
            : (
                <div className="space-y-2">
                  {(numbers ?? []).map((number: PayoutNumberItem) => (
                    <div key={number.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div>
                        <p className="font-mono font-medium">{number.phoneNumber}</p>
                        <p className="text-muted-foreground text-xs">
                          {number.operatorLabel}
                          {' · '}
                          {number.holderName}
                        </p>
                        {number.rejectionReason && (
                          <p className="text-destructive mt-1 text-xs">{number.rejectionReason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={NUMBER_VARIANTS[number.status]}>
                          {t(`wallet.numberStatus.${number.status}`)}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeNumber.isPending}
                          onClick={() => removeNumber.mutate(number.id)}
                        >
                          <Trash2 className="text-destructive h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </CardContent>
      </Card>

      {/* Withdrawal history */}
      {(withdrawals ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('wallet.withdrawalsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('wallet.columns.date')}</TableHead>
                  <TableHead>{t('wallet.columns.number')}</TableHead>
                  <TableHead className="text-right">{t('wallet.columns.amount')}</TableHead>
                  <TableHead>{t('wallet.columns.status')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(withdrawals ?? []).map((withdrawal: WithdrawalItem) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell>{new Date(withdrawal.createdAt).toLocaleDateString(i18n.language)}</TableCell>
                    <TableCell className="font-mono">{withdrawal.phoneNumber}</TableCell>
                    <TableCell className="text-right font-medium">{formatAmount(withdrawal.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={WITHDRAWAL_VARIANTS[withdrawal.status] ?? 'outline'}>
                        {t(`wallet.withdrawalStatus.${withdrawal.status}`)}
                      </Badge>
                      {withdrawal.rejectionReason && (
                        <p className="text-muted-foreground mt-1 text-xs">{withdrawal.rejectionReason}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {withdrawal.status === 'PENDING' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={cancel.isPending}
                          onClick={() => cancel.mutate(withdrawal.id)}
                        >
                          {t('common.cancel')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Movements */}
      <Card>
        <CardHeader>
          <CardTitle>{t('wallet.movementsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {(wallet?.transactions.items.length ?? 0) === 0
            ? <p className="text-muted-foreground py-2 text-sm">{t('wallet.movementsEmpty')}</p>
            : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('wallet.columns.date')}</TableHead>
                      <TableHead>{t('wallet.columns.label')}</TableHead>
                      <TableHead className="text-right">{t('wallet.columns.amount')}</TableHead>
                      <TableHead className="text-right">{t('wallet.columns.balance')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallet?.transactions.items.map(movement => (
                      <TableRow key={movement.id}>
                        <TableCell>{new Date(movement.createdAt).toLocaleDateString(i18n.language)}</TableCell>
                        <TableCell>{movement.description}</TableCell>
                        <TableCell className={`text-right font-medium ${MOVEMENT_SIGNS[movement.type] ? 'text-green-600' : ''}`}>
                          {movement.amount > 0 ? '+' : ''}
                          {movement.amount.toLocaleString('fr-FR')}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right">
                          {movement.balanceAfter.toLocaleString('fr-FR')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
        </CardContent>
      </Card>

      {/* Add number dialog */}
      <Dialog open={isAddingNumber} onOpenChange={open => !open && setIsAddingNumber(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('wallet.addNumberTitle')}</DialogTitle>
            <DialogDescription>{t('wallet.addNumberHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('wallet.fields.phoneNumber')}</Label>
              <Input
                value={phoneNumber}
                placeholder="0190123456"
                onChange={event => setPhoneNumber(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t('wallet.fields.phoneNumberHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('wallet.fields.holderName')}</Label>
              <Input
                value={holderName}
                onChange={event => setHolderName(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t('wallet.fields.holderNameHint')}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsAddingNumber(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={addNumber.isPending || phoneNumber.trim().length < 8 || holderName.trim().length < 2}
              onClick={() => addNumber.mutate()}
            >
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw dialog */}
      <Dialog open={isWithdrawing} onOpenChange={open => !open && setIsWithdrawing(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('wallet.withdrawTitle')}</DialogTitle>
            <DialogDescription>{t('wallet.withdrawBody')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('wallet.fields.toNumber')}</Label>
              <Select value={withdrawNumberId} onValueChange={setWithdrawNumberId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {validatedNumbers.map(number => (
                    <SelectItem key={number.id} value={number.id}>
                      {number.phoneNumber}
                      {' — '}
                      {number.operatorLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('wallet.fields.amount')}</Label>
              <Input
                type="number"
                min={MIN_WITHDRAWAL}
                max={balance}
                value={withdrawAmount}
                onChange={event => setWithdrawAmount(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {t('wallet.fields.amountHint', {
                  min: MIN_WITHDRAWAL.toLocaleString('fr-FR'),
                  balance: balance.toLocaleString('fr-FR'),
                })}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsWithdrawing(false)}>{t('common.cancel')}</Button>
            <Button disabled={withdraw.isPending || !isWithdrawValid} onClick={() => withdraw.mutate()}>
              {t('wallet.confirmWithdraw')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
