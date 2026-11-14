import type { ExportChecklistKey, ExportReviewDecision } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Checkbox } from '@boilerstone/ui/components/primitives/checkbox'
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
import { EXPORT_CHECKLIST_KEYS } from '../utils/terroir-types'

const MIN_REASON = 3
const MAX_REASON = 500

export interface ReviewSubmit {
  decision: ExportReviewDecision
  checklist: Partial<Record<ExportChecklistKey, boolean>>
  reason: string | null
}

interface ReviewDialogProps {
  title: string
  description: string
  /** Products go through the six-point checklist; packs only through the decision. */
  withChecklist: boolean
  /** A product without a label photo cannot be approved, whatever is ticked. */
  hasLabelPhoto: boolean
  initialChecklist?: Record<string, boolean>
  isPending: boolean
  error: string | null
  onSubmit: (review: ReviewSubmit) => void
  onClose: () => void
}

/**
 * eBio's answer on an export request. Approval needs every point of the
 * checklist ticked; a refusal needs a reason, sent to the shop.
 */
export function ReviewDialog({ title, description, withChecklist, hasLabelPhoto, initialChecklist, isPending, error, onSubmit, onClose }: ReviewDialogProps) {
  const { t } = useTranslation()
  const [checklist, setChecklist] = useState<Partial<Record<ExportChecklistKey, boolean>>>(() => {
    const initial: Partial<Record<ExportChecklistKey, boolean>> = {}
    for (const key of EXPORT_CHECKLIST_KEYS)
      initial[key] = Boolean(initialChecklist?.[key])
    return initial
  })
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const allTicked = EXPORT_CHECKLIST_KEYS.every(key => checklist[key])
  const canApprove = withChecklist ? allTicked && hasLabelPhoto : true
  const canReject = trimmed.length >= MIN_REASON

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next)
          onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {withChecklist && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">{t('admin.terroir.reviews.checklistTitle')}</legend>
            {EXPORT_CHECKLIST_KEYS.map(key => (
              <div key={key} className="flex items-start gap-3">
                <Checkbox
                  id={`checklist-${key}`}
                  checked={Boolean(checklist[key])}
                  onCheckedChange={value => setChecklist(current => ({ ...current, [key]: value === true }))}
                />
                <Label htmlFor={`checklist-${key}`} className="leading-snug font-normal">
                  {t(`admin.terroir.checklist.${key}`)}
                </Label>
              </div>
            ))}
            {!hasLabelPhoto && (
              <p className="text-ebio-earth-800 dark:text-ebio-earth-100 text-sm">{t('admin.terroir.reviews.noLabelPhoto')}</p>
            )}
          </fieldset>
        )}

        <div className="space-y-2">
          <Label htmlFor="review-reason">{t('admin.terroir.reviews.reason')}</Label>
          <Textarea
            id="review-reason"
            value={reason}
            rows={3}
            maxLength={MAX_REASON}
            placeholder={t('admin.terroir.reviews.reasonPlaceholder')}
            onChange={event => setReason(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('admin.terroir.reviews.reasonHint')}</p>
        </div>

        {error && <p className="text-destructive text-sm" role="alert">{error}</p>}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
          <Button
            variant="destructive"
            disabled={isPending || !canReject}
            onClick={() => onSubmit({ decision: 'REJECT', checklist, reason: trimmed })}
          >
            {t('admin.terroir.reviews.reject')}
          </Button>
          <Button
            disabled={isPending || !canApprove}
            onClick={() => onSubmit({ decision: 'APPROVE', checklist, reason: null })}
          >
            {isPending ? t('common.saving') : t('admin.terroir.reviews.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
