import type { AdminWalletListItem } from '../utils/withdrawals-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReturnFocus } from '@/features/admin/common/utils/use-return-focus'
import { formatAmount } from '../utils/format-amount'
import { debitWallet } from '../utils/withdrawals-queries'

/**
 * The staff debit: an amount up to the balance, a reason the owner will read,
 * and — on by default — a notification to them. Nothing is debited without
 * a reason; nothing goes below zero.
 */
export function DebitDialog({ wallet, onClose }: { wallet: AdminWalletListItem | null, onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [notify, setNotify] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const returnFocus = useReturnFocus(wallet !== null)

  const reset = () => {
    setAmount('')
    setReason('')
    setNotify(true)
    setError(null)
  }

  const debit = useMutation({
    mutationFn: () => debitWallet(wallet!.id, { amount: Number(amount), reason: reason.trim(), notify }),
    onSuccess: (result) => {
      toast.success(t('admin.withdrawals.debit.done', { amount: formatAmount(Number(amount)), balance: formatAmount(result.balanceAfter) }))
      // Covers the list, the cards and the wallet's own page.
      queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] })
      reset()
      onClose()
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  const value = Number(amount)
  const tooMuch = wallet !== null && value > wallet.balance
  const valid = value > 0 && !tooMuch && reason.trim().length >= 3

  return (
    <Dialog
      open={wallet !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent className="max-w-md" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{t('admin.withdrawals.debit.title')}</DialogTitle>
          <DialogDescription>
            {t('admin.withdrawals.debit.body', { name: wallet?.ownerName ?? '', balance: formatAmount(wallet?.balance ?? 0) })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="debit-amount">{t('admin.withdrawals.debit.amount')}</Label>
            <div className="relative">
              <Input id="debit-amount" type="number" min={1} step={100} inputMode="numeric" className="pr-16" value={amount} onChange={event => setAmount(event.target.value)} />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">FCFA</span>
            </div>
            {tooMuch && <p className="text-destructive text-sm">{t('admin.withdrawals.debit.tooMuch')}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debit-reason">{t('admin.withdrawals.debit.reason')}</Label>
            <Textarea id="debit-reason" value={reason} rows={3} placeholder={t('admin.withdrawals.debit.reasonPlaceholder')} onChange={event => setReason(event.target.value)} />
            <p className="text-muted-foreground text-xs">{t('admin.withdrawals.debit.reasonHint')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary h-4 w-4" checked={notify} onChange={event => setNotify(event.target.checked)} />
            {t('admin.withdrawals.debit.notify')}
          </label>
          {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={debit.isPending}>{t('common.cancel')}</Button>
          <Button variant="destructive" disabled={!valid || debit.isPending} onClick={() => debit.mutate()}>
            {debit.isPending ? t('common.saving') : t('admin.withdrawals.debit.confirm', { amount: value > 0 ? formatAmount(value) : '' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
