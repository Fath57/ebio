import type { StatementPeriod, StatementPreset } from '../utils/sales-statement-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { DatePicker } from '@boilerstone/ui/components/primitives/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@boilerstone/ui/components/primitives/dialog'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Download, FileSpreadsheet, Loader2, Mail } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  downloadSalesStatement,
  presetPeriod,
  sendSalesStatement,
  statementFilename,
  toDayString,
} from '../utils/sales-statement-queries'

const PRESETS: StatementPreset[] = ['today', 'week', 'month', 'lastMonth', 'custom']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/

interface SalesStatementDialogProps {
  supplierId: string
  shopName: string
  ownerEmail?: string | null
}

/** A shop's sales over a period, as Excel: downloaded here or sent by e-mail. */
export function SalesStatementDialog({ supplierId, shopName, ownerEmail }: SalesStatementDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<StatementPreset>('month')
  const [from, setFrom] = useState<Date | undefined>()
  const [to, setTo] = useState<Date | undefined>()
  const [email, setEmail] = useState(ownerEmail ?? '')
  const [busy, setBusy] = useState<'download' | 'email' | null>(null)

  const period: StatementPeriod | null = preset === 'custom'
    ? (from && to ? { from: toDayString(from), to: toDayString(to) } : null)
    : presetPeriod(preset)
  const periodError = period && period.from > period.to ? t('admin.salesStatement.periodOrder') : null
  const canSubmit = !!period && !periodError && busy === null

  const handleDownload = async () => {
    if (!period)
      return
    setBusy('download')
    try {
      await downloadSalesStatement(supplierId, period, statementFilename(shopName, period))
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : t('admin.salesStatement.failed'))
    }
    finally {
      setBusy(null)
    }
  }

  const handleSend = async () => {
    if (!period)
      return
    if (!EMAIL_PATTERN.test(email.trim())) {
      toast.error(t('admin.salesStatement.invalidEmail'))
      return
    }
    setBusy('email')
    try {
      const sentTo = await sendSalesStatement(supplierId, period, email.trim())
      toast.success(t('admin.salesStatement.sent', { email: sentTo }))
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : t('admin.salesStatement.failed'))
    }
    finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          {t('admin.salesStatement.open')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admin.salesStatement.title', { shop: shopName })}</DialogTitle>
          <DialogDescription>{t('admin.salesStatement.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('admin.salesStatement.period')}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {PRESETS.map(option => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={option === preset ? 'default' : 'outline'}
                  role="radio"
                  aria-checked={option === preset}
                  onClick={() => setPreset(option)}
                >
                  {t(`admin.salesStatement.presets.${option}`)}
                </Button>
              ))}
            </div>
          </fieldset>

          {preset === 'custom' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="statement-from">{t('admin.salesStatement.from')}</Label>
                <DatePicker id="statement-from" value={from} onChange={setFrom} dateFormat="dd/MM/yyyy" placeholder="JJ/MM/AAAA" className="w-full" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="statement-to">{t('admin.salesStatement.to')}</Label>
                <DatePicker id="statement-to" value={to} onChange={setTo} dateFormat="dd/MM/yyyy" placeholder="JJ/MM/AAAA" className="w-full" />
              </div>
              {periodError && <p className="text-sm text-destructive sm:col-span-2">{periodError}</p>}
            </div>
          )}

          {period && !periodError && (
            <p className="text-sm text-muted-foreground">
              {t('admin.salesStatement.summary', {
                from: new Date(`${period.from}T00:00:00`).toLocaleDateString('fr-FR'),
                to: new Date(`${period.to}T00:00:00`).toLocaleDateString('fr-FR'),
              })}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="statement-email">{t('admin.salesStatement.email')}</Label>
            <Input
              id="statement-email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="adresse@exemple.com"
            />
            <p className="text-xs text-muted-foreground">{t('admin.salesStatement.emailHint')}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="gap-2" disabled={!canSubmit || !email.trim()} onClick={handleSend}>
            {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {t('admin.salesStatement.send')}
          </Button>
          <Button type="button" className="gap-2" disabled={!canSubmit} onClick={handleDownload}>
            {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t('admin.salesStatement.download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
