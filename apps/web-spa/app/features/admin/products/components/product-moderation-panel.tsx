import type { ModerationAction, ProductModeration } from '../utils/products-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Can } from '@/lib/casl/can'
import { decideProductModeration } from '../utils/products-queries'

/** The decisions open from each state; the first is the expected one. */
const ACTIONS: Record<ProductModeration, ModerationAction[]> = {
  PENDING: ['approve', 'reject'],
  REJECTED: ['approve'],
  APPROVED: ['withdraw'],
  WITHDRAWN: ['restore'],
}

/** Taking a product away from the shop needs a reason the shop will read. */
const NEEDS_REASON: ModerationAction[] = ['reject', 'withdraw']

interface ProductModerationPanelProps {
  productId: string
  productName: string
  moderationStatus: ProductModeration
  moderationReason: string | null
}

/**
 * eBio's say on a product: validate or refuse a new one, withdraw one from the
 * apps, put it back. Refusing and withdrawing go through a dialog that asks
 * for the reason, sent to the shop with the notification.
 */
export function ProductModerationPanel({ productId, productName, moderationStatus, moderationReason }: ProductModerationPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [pendingAction, setPendingAction] = useState<ModerationAction | null>(null)
  const [reason, setReason] = useState('')

  const { mutate, isPending, isError, reset } = useMutation({
    mutationFn: async (input: { action: ModerationAction, reason?: string }) =>
      decideProductModeration(productId, input.action, input.reason),
    onSuccess: async () => {
      setPendingAction(null)
      setReason('')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'catalogue'] })
    },
  })

  const start = (action: ModerationAction) => {
    reset()
    if (NEEDS_REASON.includes(action)) {
      setPendingAction(action)
      return
    }
    mutate({ action })
  }

  const close = () => {
    setPendingAction(null)
    setReason('')
    reset()
  }

  return (
    <Can action="manage" subject="Product">
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{t(`admin.products.moderation.state.${moderationStatus}`)}</p>
          {moderationReason && (
            <p className="text-muted-foreground text-sm">
              {t('admin.products.moderation.reasonShown', { reason: moderationReason })}
            </p>
          )}
          {isError && pendingAction === null && (
            <p className="text-destructive text-sm">{t('admin.products.moderation.error')}</p>
          )}
        </div>
        {ACTIONS[moderationStatus].map((action, index) => (
          <Button
            key={action}
            variant={NEEDS_REASON.includes(action) ? 'destructive' : index === 0 ? 'default' : 'outline'}
            disabled={isPending}
            onClick={() => start(action)}
          >
            {t(`admin.products.moderation.actions.${action}`)}
          </Button>
        ))}
      </div>

      <Dialog
        open={pendingAction !== null}
        onOpenChange={(next) => {
          if (!next)
            close()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction && t(`admin.products.moderation.dialog.${pendingAction}.title`, { name: productName })}
            </DialogTitle>
            <DialogDescription>
              {pendingAction && t(`admin.products.moderation.dialog.${pendingAction}.description`)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="moderation-reason">{t('admin.products.moderation.reasonLabel')}</Label>
            <Textarea
              id="moderation-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder={t('admin.products.moderation.reasonPlaceholder')}
            />
            {isError && <p className="text-destructive text-sm">{t('admin.products.moderation.error')}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || reason.trim().length === 0}
              onClick={() => {
                if (pendingAction)
                  mutate({ action: pendingAction, reason: reason.trim() })
              }}
            >
              {pendingAction && t(`admin.products.moderation.actions.${pendingAction}`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Can>
  )
}
