import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@boilerstone/ui/components/primitives/form'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const MAX_REASON = 500

const withdrawSchema = z.object({
  reason: z.string().trim().min(3, 'admin.terroir.validation.withdrawReason').max(MAX_REASON),
})

type WithdrawFormData = z.infer<typeof withdrawSchema>

interface WithdrawDialogProps {
  title: string
  /** What the withdrawal does, said before the staff confirms. */
  description: string
  isPending: boolean
  error: string | null
  onSubmit: (reason: string) => void
  onClose: () => void
}

/**
 * eBio takes a product or a pack off the export, whatever its criteria. The
 * reason is required: it is sent to the shop as is.
 */
export function WithdrawDialog({ title, description, isPending, error, onSubmit, onClose }: WithdrawDialogProps) {
  const { t } = useTranslation()
  const form = useForm<WithdrawFormData>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { reason: '' },
  })

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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(values => onSubmit(values.reason.trim()))}>
            <FormField
              control={form.control}
              name="reason"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.withdraw.reason')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} maxLength={MAX_REASON} placeholder={t('admin.terroir.withdraw.reasonPlaceholder')} autoFocus />
                  </FormControl>
                  <FormDescription>{t('admin.terroir.withdraw.reasonHint')}</FormDescription>
                  {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                </FormItem>
              )}
            />
            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
              <Button type="submit" variant="destructive" disabled={isPending}>
                {isPending ? t('common.saving') : t('admin.terroir.withdraw.submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
