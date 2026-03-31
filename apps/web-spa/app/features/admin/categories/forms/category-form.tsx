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
import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ImageUpload } from '@/features/media/components/image-upload'

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  imageUrl: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0),
})

export type CategoryFormData = z.infer<typeof categorySchema>

interface CategoryFormProps {
  onSubmit: (data: CategoryFormData) => void
  isPending: boolean
  initialData?: Partial<CategoryFormData>
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export const CategoryForm: React.FC<CategoryFormProps> = ({ onSubmit, isPending, initialData }) => {
  const { t } = useTranslation()
  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema) as Resolver<CategoryFormData>,
    defaultValues: {
      name: initialData?.name ?? '',
      slug: initialData?.slug ?? '',
      imageUrl: initialData?.imageUrl ?? undefined,
      sortOrder: initialData?.sortOrder ?? 0,
    },
  })

  const handleNameChange = (value: string, onChange: (value: string) => void) => {
    onChange(value)
    if (!initialData?.slug) {
      form.setValue('slug', slugify(value))
    }
  }

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
        {/* Image */}
        <div className="space-y-2">
          <FormLabel>{t('admin.categories.form.image')}</FormLabel>
          <ImageUpload
            context="CATEGORY_IMAGE"
            max={1}
            size="lg"
            initialUrl={initialData?.imageUrl}
            onUrlChange={url => form.setValue('imageUrl', url)}
          />
        </div>

        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.categories.form.name')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={e => handleNameChange(e.target.value, field.onChange)}
                  placeholder={t('admin.categories.form.namePlaceholder')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Slug */}
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.categories.form.slug')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('admin.categories.form.slugPlaceholder')} />
              </FormControl>
              <FormDescription>
                {t('admin.categories.form.slugDescription')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Sort order */}
        <FormField
          control={form.control}
          name="sortOrder"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.categories.form.sortOrder')}</FormLabel>
              <FormControl>
                <Input {...field} type="number" min="0" className="w-32" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending
            ? t('common.saving')
            : initialData
              ? t('admin.categories.form.update')
              : t('admin.categories.form.create')}
        </Button>
      </form>
    </Form>
  )
}
