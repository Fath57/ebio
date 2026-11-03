import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@boilerstone/ui/components/primitives/form'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

export interface NewProductSettings {
  validationRequise: boolean
  emailsAlerte: string[]
}

/** One address per line, or separated by commas or spaces. */
function splitEmails(text: string): string[] {
  return text.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean)
}

const formSchema = z.object({
  validationRequise: z.boolean(),
  emails: z.string().max(5000).refine(
    text => splitEmails(text).every(email => z.email().safeParse(email).success),
    { message: 'invalidEmail' },
  ).refine(
    text => splitEmails(text).length <= 20,
    { message: 'tooMany' },
  ),
})

type FormData = z.infer<typeof formSchema>

interface NewProductSettingsFormProps {
  settings: NewProductSettings
  onSubmit: (settings: NewProductSettings) => void
  isPending: boolean
}

/**
 * What happens when a shop adds a product: checked by eBio before buyers see
 * it or not, and who is told by e-mail.
 */
export function NewProductSettingsForm({ settings, onSubmit, isPending }: NewProductSettingsFormProps) {
  const { t } = useTranslation()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { validationRequise: settings.validationRequise, emails: settings.emailsAlerte.join('\n') },
  })

  // Keep the fields in sync when the query refetches.
  useEffect(() => {
    form.reset({ validationRequise: settings.validationRequise, emails: settings.emailsAlerte.join('\n') })
  }, [settings, form])

  const submit = (data: FormData) => {
    onSubmit({ validationRequise: data.validationRequise, emailsAlerte: splitEmails(data.emails) })
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(submit)}>
        <FormField
          control={form.control}
          name="validationRequise"
          render={({ field }) => (
            <FormItem className="flex items-start justify-between gap-6">
              <div className="space-y-1">
                <FormLabel htmlFor="new-product-validation" className="text-base">
                  {t('admin.settings.newProducts.validationLabel')}
                </FormLabel>
                <FormDescription>
                  {field.value
                    ? t('admin.settings.newProducts.validationOn')
                    : t('admin.settings.newProducts.validationOff')}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  id="new-product-validation"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="emails"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel htmlFor="new-product-emails">{t('admin.settings.newProducts.emailsLabel')}</FormLabel>
              <FormControl>
                <Textarea
                  id="new-product-emails"
                  rows={4}
                  placeholder="catalogue@ebio.bj"
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('admin.settings.newProducts.emailsHint')}</FormDescription>
              {fieldState.error?.message
                ? <p className="text-destructive text-sm">{t(`admin.settings.newProducts.${fieldState.error.message}`)}</p>
                : <FormMessage />}
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
