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
import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const productUnitSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  label: z.string().min(1).max(64),
  shortLabel: z.string().min(1).max(16),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
})

export type ProductUnitFormData = z.infer<typeof productUnitSchema>

interface ProductUnitFormProps {
  onSubmit: (data: ProductUnitFormData) => void
  isPending: boolean
  initialData?: Partial<ProductUnitFormData>
  /** Editing: the code is already written onto products and cannot move. */
  isEditing?: boolean
}

/** Turns « Botte de 500 g » into « BOTTE_DE_500_G » as the label is typed. */
function toCode(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32)
}

export const ProductUnitForm: React.FC<ProductUnitFormProps> = ({
  onSubmit,
  isPending,
  initialData,
  isEditing = false,
}) => {
  const { t } = useTranslation()
  const form = useForm<ProductUnitFormData>({
    resolver: zodResolver(productUnitSchema) as Resolver<ProductUnitFormData>,
    defaultValues: {
      code: initialData?.code ?? '',
      label: initialData?.label ?? '',
      shortLabel: initialData?.shortLabel ?? '',
      isActive: initialData?.isActive ?? true,
      sortOrder: initialData?.sortOrder ?? 0,
    },
  })

  function handleLabelChange(value: string, onChange: (value: string) => void) {
    onChange(value)
    // Only while creating, and only until the admin writes their own code.
    if (!isEditing && !form.formState.dirtyFields.code) {
      form.setValue('code', toCode(value))
    }
  }

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.productUnits.form.label')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={e => handleLabelChange(e.target.value, field.onChange)}
                  placeholder={t('admin.productUnits.form.labelPlaceholder')}
                />
              </FormControl>
              <FormDescription>{t('admin.productUnits.form.labelHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="shortLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.productUnits.form.shortLabel')}</FormLabel>
              <FormControl>
                <Input {...field} className="w-40" placeholder={t('admin.productUnits.form.shortLabelPlaceholder')} />
              </FormControl>
              <FormDescription>{t('admin.productUnits.form.shortLabelHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.productUnits.form.code')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={isEditing}
                  className="w-56 font-mono uppercase"
                  placeholder={t('admin.productUnits.form.codePlaceholder')}
                  onChange={e => field.onChange(toCode(e.target.value))}
                />
              </FormControl>
              <FormDescription>
                {isEditing
                  ? t('admin.productUnits.form.codeLocked')
                  : t('admin.productUnits.form.codeHint')}
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
                <FormLabel>{t('admin.productUnits.form.sortOrder')}</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" className="w-32" />
                </FormControl>
                <FormDescription>{t('admin.productUnits.form.sortOrderHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-col justify-center gap-2">
                <FormLabel>{t('admin.productUnits.form.isActive')}</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormDescription>{t('admin.productUnits.form.isActiveHint')}</FormDescription>
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending
            ? t('common.saving')
            : isEditing
              ? t('admin.productUnits.form.update')
              : t('admin.productUnits.form.create')}
        </Button>
      </form>
    </Form>
  )
}
