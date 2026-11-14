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
import { Input } from '@boilerstone/ui/components/primitives/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { formatGrams } from '../utils/terroir-format'

const weighSchema = z.object({
  grams: z.string().trim().regex(/^\d{1,6}$/, 'admin.terroir.validation.grams').refine(value => Number(value) > 0 && Number(value) <= 200_000, 'admin.terroir.validation.grams'),
})

type WeighFormData = z.infer<typeof weighSchema>

interface WeighDialogProps {
  estimatedWeightG: number
  actualWeightG: number | null
  isPending: boolean
  error: string | null
  onSubmit: (grams: number) => void
  onClose: () => void
}

/**
 * The parcel on the scale, in grams. Past the tolerance the buyer is asked a
 * supplement (or to take a product out); under it eBio absorbs the gap.
 */
export function WeighDialog({ estimatedWeightG, actualWeightG, isPending, error, onSubmit, onClose }: WeighDialogProps) {
  const { t } = useTranslation()
  const form = useForm<WeighFormData>({
    resolver: zodResolver(weighSchema),
    defaultValues: { grams: actualWeightG == null ? '' : String(actualWeightG) },
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
          <DialogTitle>{t('admin.terroir.weigh.title')}</DialogTitle>
          <DialogDescription>{t('admin.terroir.weigh.description', { estimated: formatGrams(estimatedWeightG) })}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(values => onSubmit(Number(values.grams)))}>
            <FormField
              control={form.control}
              name="grams"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.weigh.label')}</FormLabel>
                  <FormControl><Input {...field} inputMode="numeric" autoFocus /></FormControl>
                  <FormDescription>{t('admin.terroir.weigh.hint')}</FormDescription>
                  {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                </FormItem>
              )}
            />
            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? t('common.saving') : t('admin.terroir.weigh.submit')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
