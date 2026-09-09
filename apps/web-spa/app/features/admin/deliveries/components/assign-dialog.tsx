import type { AdminDeliveryDetail, CourierCandidate } from '../utils/deliveries-queries'
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

interface AssignDialogProps {
  delivery: AdminDeliveryDetail
  candidate: CourierCandidate | null
  isPending: boolean
  onConfirm: (note: string) => void
  onClose: () => void
}

export function AssignDialog({ delivery, candidate, isPending, onConfirm, onClose }: AssignDialogProps) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')

  const open = candidate !== null
  const previous = delivery.courier && delivery.courierId !== candidate?.id ? delivery.courier.name : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next)
          onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('admin.deliveries.assignPage.confirmTitle', { name: candidate?.fullName ?? '' })}
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block">{t('admin.deliveries.assignPage.confirmBody')}</span>
            {previous && (
              <span className="block font-medium text-foreground">
                {t('admin.deliveries.assignPage.confirmPrevious', { name: previous })}
              </span>
            )}
            {candidate && !candidate.isAvailable && (
              <span className="block text-amber-700">
                {t('admin.deliveries.assignPage.confirmUnavailable')}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="assign-note">{t('admin.deliveries.assignPage.note')}</Label>
          <Textarea
            id="assign-note"
            value={note}
            maxLength={300}
            rows={3}
            placeholder={t('admin.deliveries.assignPage.notePlaceholder')}
            onChange={event => setNote(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onConfirm(note.trim())} disabled={isPending}>
            {isPending ? t('common.saving') : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
