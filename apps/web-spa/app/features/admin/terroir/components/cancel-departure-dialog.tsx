import type { ExportDeparture } from '../utils/terroir-types'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@boilerstone/ui/components/primitives/select'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDay } from '../utils/terroir-format'

const NO_REASSIGN = 'none'

interface CancelDepartureDialogProps {
  departure: ExportDeparture
  /** Other open departures the parcels may move to. */
  targets: ExportDeparture[]
  isPending: boolean
  error: string | null
  onConfirm: (reassignTo: string | null) => void
  onClose: () => void
}

/**
 * Cancelling a departure cannot be undone. Its parcels may move to another
 * open departure — eBio pays the difference when that one is dearer — or wait
 * on this one until the staff decide.
 */
export function CancelDepartureDialog({ departure, targets, isPending, error, onConfirm, onClose }: CancelDepartureDialogProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState(NO_REASSIGN)

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next)
          onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin.terroir.departures.cancelTitle')}</DialogTitle>
          <DialogDescription>
            {t('admin.terroir.departures.cancelDescription', {
              agency: departure.agency.name,
              date: formatDay(departure.departsOn),
              count: departure.shipmentCount,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reassign-target">{t('admin.terroir.departures.reassignLabel')}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="reassign-target"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_REASSIGN}>{t('admin.terroir.departures.noReassign')}</SelectItem>
              {targets.map(item => (
                <SelectItem key={item.id} value={item.id}>
                  {t('admin.terroir.departures.reassignOption', { agency: item.agency.name, date: formatDay(item.departsOn) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{t('admin.terroir.departures.reassignHint')}</p>
        </div>
        {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => onConfirm(target === NO_REASSIGN ? null : target)}
          >
            {isPending ? t('common.saving') : t('admin.terroir.departures.cancelConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
