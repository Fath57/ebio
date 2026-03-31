import { client } from '@boilerstone/openapi-generator'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useState } from 'react'
import { useFieldArray, useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ImageUpload } from '@/features/media/components/image-upload'

// ---------- Schema ----------

const variantSchema = z.object({
  label: z.string().min(1),
  pricePerUnit: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0),
})

const productSchema = z.object({
  name: z.string().min(2).max(200),
  categoryId: z.string().uuid(),
  description: z.string().max(2000).optional(),
  pricePerUnit: z.coerce.number().min(0),
  unit: z.enum(['KG', 'LITER', 'SACHET', 'PIECE', 'LOT']),
  stock: z.coerce.number().int().min(0),
  stockAlertThreshold: z.coerce.number().int().min(0).default(5),
  status: z.enum(['ACTIVE', 'OUT_OF_STOCK', 'HIDDEN']).default('ACTIVE'),
  variants: z.array(variantSchema).optional(),
  hasPromotion: z.boolean().default(false),
  promotionalPrice: z.coerce.number().min(0).optional(),
  promotionExpiresAt: z.string().optional(),
  mediaIds: z.array(z.string()).optional(),
})

export type ProductFormData = z.infer<typeof productSchema>

const STEPS = ['info', 'pricing', 'extras'] as const
type Step = typeof STEPS[number]

// Fields to validate per step
const STEP_FIELDS: Record<Step, (keyof ProductFormData)[]> = {
  info: ['name', 'categoryId'],
  pricing: ['pricePerUnit', 'unit', 'stock'],
  extras: [],
}

// ---------- Component ----------

interface ProductFormProps {
  onSubmit: (data: ProductFormData) => void
  isPending: boolean
  initialData?: Partial<ProductFormData> & { photos?: string[] }
}

export function ProductForm({ onSubmit, isPending, initialData }: ProductFormProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState<number>(0)

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await client.get({ url: '/api/search/categories' })
      return res.data as { categories: Array<{ id: string, name: string, slug: string, imageUrl: string | null }> }
    },
  })
  const categories = categoriesData?.categories ?? []

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema) as Resolver<ProductFormData>,
    defaultValues: {
      name: initialData?.name ?? '',
      categoryId: initialData?.categoryId ?? '',
      description: initialData?.description ?? '',
      pricePerUnit: initialData?.pricePerUnit ?? 0,
      unit: initialData?.unit ?? 'KG',
      stock: initialData?.stock ?? 0,
      stockAlertThreshold: initialData?.stockAlertThreshold ?? 5,
      status: initialData?.status ?? 'ACTIVE',
      variants: initialData?.variants ?? [],
      hasPromotion: !!initialData?.promotionalPrice,
      promotionalPrice: initialData?.promotionalPrice ?? 0,
      promotionExpiresAt: initialData?.promotionExpiresAt ?? '',
      mediaIds: initialData?.mediaIds ?? [],
    },
  })

  const { fields: variantFields, append: addVariant, remove: removeVariant } = useFieldArray({
    control: form.control,
    name: 'variants',
  })

  const hasPromotion = form.watch('hasPromotion')
  const pricePerUnit = form.watch('pricePerUnit')
  const step = STEPS[currentStep]

  async function handleNext() {
    const fields = STEP_FIELDS[step]
    // eslint-disable-next-line ts/no-explicit-any
    const valid = fields.length === 0 || await form.trigger(fields as any)
    if (valid && currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  function handleSubmit(data: ProductFormData) {
    onSubmit(data)
  }

  const stepLabels = [
    t('catalog.form.stepInfo'),
    t('catalog.form.stepPricing'),
    t('catalog.form.stepExtras'),
  ]

  return (
    <Form {...form}>
      <form
        className="space-y-6"
        onSubmit={e => e.preventDefault()}
      >

        {/* ===== Step indicator ===== */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <button
                type="button"
                onClick={() => i < currentStep && setCurrentStep(i)}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  i === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : i < currentStep
                      ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background/20 text-xs">
                  {i < currentStep ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{stepLabels[i]}</span>
              </button>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </React.Fragment>
          ))}
        </div>

        {/* ===== Step 1: Info & Photos ===== */}
        {step === 'info' && (
          <div className="space-y-6">
            {/* Photos */}
            <div>
              <FormLabel>{t('catalog.form.photos')}</FormLabel>
              <FormDescription>{t('catalog.form.photosDescription')}</FormDescription>
              <div className="mt-2">
                <ImageUpload
                  context="PRODUCT_PHOTO"
                  max={3}
                  existingUrls={initialData?.photos}
                  onMediaIdsChange={ids => form.setValue('mediaIds', ids)}
                />
              </div>
            </div>

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.form.name')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t('catalog.form.namePlaceholder')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.form.category')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('catalog.form.categoryPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <span className="flex items-center gap-2">
                            {cat.imageUrl
                              ? <img src={cat.imageUrl} alt="" className="h-5 w-5 rounded object-cover" />
                              : <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-xs">📦</span>}
                            {cat.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.form.description')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder={t('catalog.form.descriptionPlaceholder')} rows={3} maxLength={2000} />
                  </FormControl>
                  <FormDescription>
                    {(field.value?.length ?? 0)}
                    /2000
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* ===== Step 2: Pricing & Stock ===== */}
        {step === 'pricing' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="pricePerUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.form.pricePerUnit')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} type="number" min="0" step="100" className="pr-16" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">FCFA</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.form.unit')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="KG">{t('catalog.units.kg')}</SelectItem>
                        <SelectItem value="LITER">{t('catalog.units.liter')}</SelectItem>
                        <SelectItem value="SACHET">{t('catalog.units.sachet')}</SelectItem>
                        <SelectItem value="PIECE">{t('catalog.units.piece')}</SelectItem>
                        <SelectItem value="LOT">{t('catalog.units.lot')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
              <FormField
                control={form.control}
                name="stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.form.stock')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min="0" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stockAlertThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.form.stockAlertThreshold')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min="0" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <p className="text-sm text-muted-foreground">{t('catalog.form.stockAlertDescription')}</p>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.form.status')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ACTIVE">
                        <Badge variant="default" className="bg-ebio-green-400">{t('catalog.status.active')}</Badge>
                      </SelectItem>
                      <SelectItem value="OUT_OF_STOCK">
                        <Badge variant="destructive">{t('catalog.status.outOfStock')}</Badge>
                      </SelectItem>
                      <SelectItem value="HIDDEN">
                        <Badge variant="secondary">{t('catalog.status.hidden')}</Badge>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {/* ===== Step 3: Variants & Promotion ===== */}
        {step === 'extras' && (
          <div className="space-y-6">
            {/* Variants */}
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <FormLabel>{t('catalog.form.variants')}</FormLabel>
                  <FormDescription>{t('catalog.form.variantsDescription')}</FormDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addVariant({ label: '', pricePerUnit: pricePerUnit ?? 0, stock: 0 })}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('catalog.form.addVariant')}
                </Button>
              </div>
              {variantFields.length > 0 && (
                <div className="mt-3 space-y-3">
                  {variantFields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-3 rounded-lg border p-3">
                      <FormField control={form.control} name={`variants.${index}.label`} render={({ field: f }) => (
                        <FormItem className="flex-1">
                          <FormLabel className="text-xs">{t('catalog.form.variantLabel')}</FormLabel>
                          <FormControl><Input {...f} placeholder="Ex: 0,5 L, 1 L, 5 L" /></FormControl>
                        </FormItem>
                      )}
                      />
                      <FormField control={form.control} name={`variants.${index}.pricePerUnit`} render={({ field: f }) => (
                        <FormItem className="w-32">
                          <FormLabel className="text-xs">{t('catalog.form.variantPrice')}</FormLabel>
                          <FormControl><Input {...f} type="number" min="0" step="100" /></FormControl>
                        </FormItem>
                      )}
                      />
                      <FormField control={form.control} name={`variants.${index}.stock`} render={({ field: f }) => (
                        <FormItem className="w-24">
                          <FormLabel className="text-xs">{t('catalog.form.variantStock')}</FormLabel>
                          <FormControl><Input {...f} type="number" min="0" /></FormControl>
                        </FormItem>
                      )}
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(index)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Promotion */}
            <FormField
              control={form.control}
              name="hasPromotion"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <FormLabel>{t('catalog.form.promotion')}</FormLabel>
                    <FormDescription>{t('catalog.form.promotionDescription')}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {hasPromotion && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="promotionalPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalog.form.promotionalPrice')}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input {...field} type="number" min="0" step="100" className="pr-16" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">FCFA</span>
                        </div>
                      </FormControl>
                      {pricePerUnit > 0 && field.value && Number(field.value) > 0 && (
                        <FormDescription>
                          -
                          {Math.round((1 - Number(field.value) / pricePerUnit) * 100)}
                          %
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="promotionExpiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalog.form.promotionExpiry')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" min={new Date().toISOString().split('T')[0]} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        )}

        {/* ===== Navigation buttons ===== */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('common.back')}
          </Button>

          {currentStep < STEPS.length - 1
            ? (
                <Button type="button" onClick={handleNext}>
                  {stepLabels[currentStep + 1]}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              )
            : (
                <Button type="button" disabled={isPending} onClick={form.handleSubmit(handleSubmit)}>
                  {isPending
                    ? t('common.saving')
                    : initialData
                      ? t('catalog.form.update')
                      : t('catalog.form.create')}
                </Button>
              )}
        </div>
      </form>
    </Form>
  )
}
