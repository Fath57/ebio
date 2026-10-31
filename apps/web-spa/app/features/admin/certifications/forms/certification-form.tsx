import type { Resolver } from 'react-hook-form'
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
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ImageUpload } from '@/features/media/components/image-upload'

const certificationSchema = z.object({
  code: z.string().min(2).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  logoUrl: z.string().optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
})

export type CertificationFormData = z.infer<typeof certificationSchema>

interface CertificationFormProps {
  onSubmit: (data: CertificationFormData) => void
  isPending: boolean
  initialData?: Partial<CertificationFormData>
  /** Editing: the code is already written onto products and cannot move. */
  isEditing?: boolean
}

/** Turns « Commerce équitable » into « commerce-equitable » as the name is typed. */
function toCode(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

export function CertificationForm({ onSubmit, isPending, initialData, isEditing = false }: CertificationFormProps) {
  const { t } = useTranslation()
  const form = useForm<CertificationFormData>({
    resolver: zodResolver(certificationSchema) as Resolver<CertificationFormData>,
    defaultValues: {
      code: initialData?.code ?? '',
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      logoUrl: initialData?.logoUrl ?? undefined,
      isActive: initialData?.isActive ?? true,
      sortOrder: initialData?.sortOrder ?? 0,
    },
  })

  function handleNameChange(value: string, onChange: (value: string) => void) {
    onChange(value)
    // Only while creating, and only until the admin writes their own code.
    if (!isEditing && !form.formState.dirtyFields.code)
      form.setValue('code', toCode(value))
  }

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <FormLabel>{t('admin.certifications.form.logo')}</FormLabel>
          <ImageUpload
            context="CATEGORY_IMAGE"
            max={1}
            size="md"
            initialUrl={initialData?.logoUrl}
            onUrlChange={url => form.setValue('logoUrl', url)}
          />
          <p className="text-muted-foreground text-sm">{t('admin.certifications.form.logoHint')}</p>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.certifications.form.name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={e => handleNameChange(e.target.value, field.onChange)}
                  placeholder={t('admin.certifications.form.namePlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.certifications.form.description')}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} placeholder={t('admin.certifications.form.descriptionPlaceholder')} />
              </FormControl>
              <FormDescription>{t('admin.certifications.form.descriptionHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.certifications.form.code')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={isEditing}
                  className="w-64 font-mono"
                  onChange={e => field.onChange(toCode(e.target.value))}
                />
              </FormControl>
              <FormDescription>
                {isEditing ? t('admin.certifications.form.codeLocked') : t('admin.certifications.form.codeHint')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="sortOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('admin.certifications.form.sortOrder')}</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" className="w-32" />
                </FormControl>
                <FormDescription>{t('admin.certifications.form.sortOrderHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-col justify-center gap-2">
                <FormLabel>{t('admin.certifications.form.isActive')}</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormDescription>{t('admin.certifications.form.isActiveHint')}</FormDescription>
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending
            ? t('common.saving')
            : isEditing ? t('admin.certifications.form.update') : t('admin.certifications.form.create')}
        </Button>
      </form>
    </Form>
  )
}
