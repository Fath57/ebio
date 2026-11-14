import type { ExportAgency, ExportAgencyInput } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const agencySchema = z.object({
  name: z.string().trim().min(2, 'admin.terroir.validation.nameMin').max(120),
  contactName: z.string().trim().max(120),
  contactPhone: z.string().trim().max(30),
  contactEmail: z.union([z.literal(''), z.string().trim().email('admin.terroir.validation.email').max(200)]),
  notes: z.string().trim().max(2000),
  active: z.boolean(),
})

type AgencyFormData = z.infer<typeof agencySchema>

function orNull(value: string): string | null {
  return value.trim() || null
}

interface AgencyFormDialogProps {
  /** Null: a new agency. */
  agency: ExportAgency | null
  isPending: boolean
  error: string | null
  onSubmit: (input: ExportAgencyInput) => void
  onClose: () => void
}

/** Creates or edits a partner agency: its name, who to call, and private notes. */
export function AgencyFormDialog({ agency, isPending, error, onSubmit, onClose }: AgencyFormDialogProps) {
  const { t } = useTranslation()
  const form = useForm<AgencyFormData>({
    resolver: zodResolver(agencySchema),
    defaultValues: {
      name: agency?.name ?? '',
      contactName: agency?.contactName ?? '',
      contactPhone: agency?.contactPhone ?? '',
      contactEmail: agency?.contactEmail ?? '',
      notes: agency?.notes ?? '',
      active: agency?.active ?? true,
    },
  })

  const submit = (values: AgencyFormData) => {
    onSubmit({
      name: values.name.trim(),
      contactName: orNull(values.contactName),
      contactPhone: orNull(values.contactPhone),
      contactEmail: orNull(values.contactEmail),
      notes: orNull(values.notes),
      active: values.active,
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next)
          onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{agency ? t('admin.terroir.agencies.editTitle') : t('admin.terroir.agencies.createTitle')}</DialogTitle>
          <DialogDescription>{t('admin.terroir.agencies.formDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.agencies.fields.name')}</FormLabel>
                  <FormControl><Input {...field} maxLength={120} /></FormControl>
                  {fieldState.error?.message
                    ? <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>
                    : <FormMessage />}
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.agencies.fields.contactName')}</FormLabel>
                    <FormControl><Input {...field} maxLength={120} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.agencies.fields.contactPhone')}</FormLabel>
                    <FormControl><Input {...field} type="tel" maxLength={30} /></FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="contactEmail"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.agencies.fields.contactEmail')}</FormLabel>
                  <FormControl><Input {...field} type="email" maxLength={200} /></FormControl>
                  {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.agencies.fields.notes')}</FormLabel>
                  <FormControl><Textarea {...field} rows={3} maxLength={2000} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4">
                  <FormLabel>{t('admin.terroir.agencies.fields.active')}</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? t('common.saving') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
