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
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export type SanctionKind = 'suspend' | 'ban' | 'reinstate'

interface SanctionDialogProps {
  kind: SanctionKind | null
  userName: string
  isPending: boolean
  onConfirm: (values: { reason: string, until?: Date }) => void
  onClose: () => void
}

const MIN_REASON = 3
const MAX_REASON = 255

/** Native date input value ("YYYY-MM-DD") → end of that local day. */
function endOfDay(value: string): Date | undefined {
  if (!value)
    return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 23, 59, 59, 999)
}

function todayValue(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** One dialog for the three sanctions; the body adapts to `kind`. */
export function UserSanctionDialog({ kind, userName, isPending, onConfirm, onClose }: SanctionDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')

  const reasonRequired = kind !== 'reinstate'
  const trimmed = reason.trim()
  const reasonValid = !reasonRequired || (trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON)

  const reset = () => {
    setReason('')
    setUntil('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const titles: Record<SanctionKind, string> = {
    suspend: t('admin.users.actions.suspend'),
    ban: t('admin.users.actions.ban'),
    reinstate: t('admin.users.actions.reinstate'),
  }
  const descriptions: Record<SanctionKind, string> = {
    suspend: t('admin.users.actions.suspendConfirm', { name: userName }),
    ban: t('admin.users.actions.banConfirm'),
    reinstate: t('admin.users.actions.reinstateConfirm', { name: userName }),
  }

  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open)
          close()
      }}
    >
      <DialogContent>
        {kind && (
          <>
            <DialogHeader>
              <DialogTitle>{titles[kind]}</DialogTitle>
              <DialogDescription>{descriptions[kind]}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sanction-reason">
                  {kind === 'reinstate' ? t('admin.users.actions.reinstateNote') : t('admin.users.actions.reason')}
                </Label>
                <Textarea
                  id="sanction-reason"
                  value={reason}
                  rows={3}
                  maxLength={MAX_REASON}
                  placeholder={t('admin.users.actions.reasonPlaceholder')}
                  onChange={event => setReason(event.target.value)}
                />
              </div>

              {kind === 'suspend' && (
                <div className="space-y-2">
                  <Label htmlFor="sanction-until">{t('admin.users.actions.until')}</Label>
                  <Input
                    id="sanction-until"
                    type="date"
                    min={todayValue()}
                    value={until}
                    onChange={event => setUntil(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('admin.users.actions.untilHint')}</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={isPending}>
                {t('common.cancel')}
              </Button>
              <Button
                variant={kind === 'ban' ? 'destructive' : 'default'}
                disabled={isPending || !reasonValid}
                onClick={() => {
                  onConfirm({ reason: trimmed, until: kind === 'suspend' ? endOfDay(until) : undefined })
                  reset()
                }}
              >
                {isPending ? t('common.saving') : titles[kind]}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
