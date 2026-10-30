import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { useTranslation } from 'react-i18next'
import { useReturnFocus } from '../utils/use-return-focus'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  isPending?: boolean
  /** Why the last attempt failed, shown above the buttons. */
  error?: string | null
  /** Danger styling for what cannot be undone; plain primary otherwise. */
  destructive?: boolean
}

/** The one confirmation step every irreversible back-office action goes through. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  isPending = false,
  error,
  destructive = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const returnFocus = useReturnFocus(open)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={isPending}>
            {isPending ? t('common.saving') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
