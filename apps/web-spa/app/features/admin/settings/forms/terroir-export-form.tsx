import type { Resolver, UseFormReturn } from 'react-hook-form'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Checkbox } from '@boilerstone/ui/components/primitives/checkbox'
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
import { Label } from '@boilerstone/ui/components/primitives/label'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const terroirTuningSchema = z.object({
  packagingWeightG: z.coerce.number().int().min(0).max(5_000),
  collectionDays: z.coerce.number().int().min(0).max(30),
  weightTolerancePct: z.coerce.number().int().min(0).max(100),
  /** Shown in percent, stored in basis points (2 % = 200). */
  insuranceRatePct: z.coerce.number().min(0).max(50),
  insuranceMin: z.coerce.number().int().min(0).max(1_000_000),
  bannedCategoryIds: z.array(z.string()).max(200),
  pickupReminderDays: z.coerce.number().int().min(1).max(90),
})

export type TerroirTuningFormData = z.infer<typeof terroirTuningSchema>

export interface TerroirCategoryOption {
  id: string
  name: string
}

interface TerroirExportFormProps {
  values: TerroirTuningFormData
  categories: TerroirCategoryOption[]
  onSubmit: (values: TerroirTuningFormData) => void
  isPending: boolean
}

interface NumberFieldProps {
  form: UseFormReturn<TerroirTuningFormData>
  name: Exclude<keyof TerroirTuningFormData, 'bannedCategoryIds'>
  min: number
  max: number
  step?: number
}

function NumberField({ form, name, min, max, step = 1 }: NumberFieldProps) {
  const { t } = useTranslation()
  const id = `terroir-${name}`
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel htmlFor={id}>{t(`admin.settings.terroirExport.fields.${name}`)}</FormLabel>
          <FormControl>
            <Input id={id} type="number" min={min} max={max} step={step} {...field} />
          </FormControl>
          <FormDescription>{t(`admin.settings.terroirExport.fields.${name}Hint`)}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/**
 * The tuning of the terroir export: packaging added to every parcel, how
 * long eBio needs to collect, the weight gap tolerated before a supplement,
 * the insurance price, the banned categories and the pickup reminder.
 */
export function TerroirExportForm({ values, categories, onSubmit, isPending }: TerroirExportFormProps) {
  const { t } = useTranslation()
  const form = useForm<TerroirTuningFormData>({
    resolver: zodResolver(terroirTuningSchema) as Resolver<TerroirTuningFormData>,
    defaultValues: values,
  })

  // Keep the fields in sync when the query refetches.
  useEffect(() => {
    form.reset(values)
  }, [values, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField form={form} name="packagingWeightG" min={0} max={5000} />
          <NumberField form={form} name="collectionDays" min={0} max={30} />
          <NumberField form={form} name="weightTolerancePct" min={0} max={100} />
          <NumberField form={form} name="pickupReminderDays" min={1} max={90} />
          <NumberField form={form} name="insuranceRatePct" min={0} max={50} step={0.01} />
          <NumberField form={form} name="insuranceMin" min={0} max={1000000} />
        </div>

        <FormField
          control={form.control}
          name="bannedCategoryIds"
          render={({ field }) => {
            const selected = new Set(field.value)
            const toggle = (id: string, checked: boolean) => {
              const next = new Set(selected)
              if (checked)
                next.add(id)
              else
                next.delete(id)
              field.onChange([...next])
            }
            return (
              <FormItem>
                <FormLabel>{t('admin.settings.terroirExport.fields.bannedCategoryIds')}</FormLabel>
                <FormDescription>{t('admin.settings.terroirExport.fields.bannedCategoryIdsHint')}</FormDescription>
                <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                  {categories.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.settings.terroirExport.noCategories')}</p>}
                  {categories.map(category => (
                    <div key={category.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`terroir-banned-${category.id}`}
                        checked={selected.has(category.id)}
                        onCheckedChange={checked => toggle(category.id, checked === true)}
                      />
                      <Label htmlFor={`terroir-banned-${category.id}`} className="font-normal">{category.name}</Label>
                    </div>
                  ))}
                </div>
              </FormItem>
            )
          }}
        />

        <Button type="submit" disabled={isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
