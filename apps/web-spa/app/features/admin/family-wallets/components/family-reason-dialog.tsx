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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const MIN_REASON = 3
const MAX_REASON = 500

interface FamilyReasonDialogProps {
  open: boolean
  kind: 'suspend' | 'resume'
  title: string
  description: string
  isPending: boolean
  onConfirm: (reason: string) => void
  onClose: () => void
}

/**
 * Confirms a suspension or a resumption. A suspension needs a reason — it goes
 * to the audit trail and to the payer; a resumption takes an optional note.
 */
export function FamilyReasonDialog({ open, kind, title, description, isPending, onConfirm, onClose }: FamilyReasonDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const reasonRequired = kind === 'suspend'
  const reasonValid = reasonRequired ? trimmed.length >= MIN_REASON : true

  const close = () => {
    setReason('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next)
          close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="family-reason">
            {reasonRequired ? t('admin.familyWallets.dialog.reason') : t('admin.familyWallets.dialog.note')}
          </Label>
          <Textarea
            id="family-reason"
            value={reason}
            rows={3}
            maxLength={MAX_REASON}
            placeholder={t('admin.familyWallets.dialog.reasonPlaceholder')}
            aria-invalid={reasonRequired && trimmed.length > 0 && !reasonValid}
            onChange={event => setReason(event.target.value)}
          />
          {reasonRequired && (
            <p className="text-muted-foreground text-xs">{t('admin.familyWallets.dialog.reasonHint')}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={kind === 'suspend' ? 'destructive' : 'default'}
            disabled={isPending || !reasonValid}
            onClick={() => onConfirm(trimmed)}
          >
            {isPending ? t('common.saving') : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
