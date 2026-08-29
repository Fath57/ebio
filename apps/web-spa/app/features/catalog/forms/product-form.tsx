import type { Resolver } from 'react-hook-form'
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
import { ArrowLeft, ArrowRight, Check, ChevronDown, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { fetchActiveProductUnitsQueryOptions } from '@/features/admin/product-units/utils/product-units-queries'
import { ChipMultiSelect } from '../components/chip-multi-select'
import { ProductPhotoManager } from '../components/product-photo-manager'
import {
  ALLERGEN_CODES,
  allergenName,
  basisName,
  DEFAULT_NUTRITION_BASIS,
  LABEL_CODES,
  labelName,
  NUTRITION_BASES,
  nutritionPerBasis,
} from '../utils/composition'

// ---------- Schema ----------

const variantSchema = z.object({
  label: z.string().min(1),
  pricePerUnit: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0),
})

// Empty numeric inputs must resolve to undefined, not 0 (coerce turns '' into 0)
function optionalAmount(max: number) {
  return z.preprocess(
    value => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(0).max(max).optional(),
  )
}

// Bounds mirror the API contract: kcal per 100 g/ml, grams per 100 g/ml
const nutritionalValuesSchema = z.object({
  basis: z.enum(NUTRITION_BASES).default(DEFAULT_NUTRITION_BASIS),
  energyKcal: optionalAmount(900),
  fat: optionalAmount(100),
  saturatedFat: optionalAmount(100),
  carbohydrates: optionalAmount(100),
  sugars: optionalAmount(100),
  fiber: optionalAmount(100),
  protein: optionalAmount(100),
  salt: optionalAmount(100),
})

const productSchema = z.object({
  name: z.string().min(2).max(200),
  categoryId: z.string().uuid(),
  description: z.string().max(2000).optional(),
  pricePerUnit: z.coerce.number().min(0),
  unit: z.string().min(1),
  stock: z.coerce.number().int().min(0),
  stockAlertThreshold: z.coerce.number().int().min(0).default(5),
  status: z.enum(['ACTIVE', 'OUT_OF_STOCK', 'HIDDEN']).default('ACTIVE'),
  variants: z.array(variantSchema).optional(),
  hasPromotion: z.boolean().default(false),
  promotionalPrice: z.coerce.number().min(0).optional(),
  promotionExpiresAt: z.string().optional(),
  mediaIds: z.array(z.string()).optional(),
  // Existing photo URLs kept on the product, in display order (edit mode)
  photos: z.array(z.string()).optional(),
  // Composition & product sheet
  ingredients: z.string().max(4000).optional(),
  allergens: z.array(z.enum(ALLERGEN_CODES)).max(20).optional(),
  labels: z.array(z.enum(LABEL_CODES)).max(10).optional(),
  origin: z.string().max(200).optional(),
  conservation: z.string().max(1000).optional(),
  nutritionalValues: nutritionalValuesSchema.optional(),
})

export type ProductFormData = z.infer<typeof productSchema>

// Cross-field rules validated with translated messages so the inline errors
// are localized: nutrition sub-totals cannot exceed their parent, and
// promotion fields are only meaningful when the switch is on.
function buildProductSchema(t: (key: string) => string) {
  return productSchema.superRefine((data, ctx) => {
    const nutrition = data.nutritionalValues
    if (nutrition?.saturatedFat != null && nutrition.fat != null && nutrition.saturatedFat > nutrition.fat)
      ctx.addIssue({ code: 'custom', path: ['nutritionalValues', 'saturatedFat'], message: t('catalog.composition.validation.saturatedFat') })
    if (nutrition?.sugars != null && nutrition.carbohydrates != null && nutrition.sugars > nutrition.carbohydrates)
      ctx.addIssue({ code: 'custom', path: ['nutritionalValues', 'sugars'], message: t('catalog.composition.validation.sugars') })

    if (!data.hasPromotion)
      return
    if (!data.promotionalPrice || data.promotionalPrice <= 0) {
      ctx.addIssue({ code: 'custom', path: ['promotionalPrice'], message: t('catalog.form.promotionPriceRequired') })
    }
    else if (data.pricePerUnit > 0 && data.promotionalPrice >= data.pricePerUnit) {
      ctx.addIssue({ code: 'custom', path: ['promotionalPrice'], message: t('catalog.form.promotionPriceTooHigh') })
    }
    if (!data.promotionExpiresAt)
      ctx.addIssue({ code: 'custom', path: ['promotionExpiresAt'], message: t('catalog.form.promotionExpiryRequired') })
  })
}

const STEPS = ['essentials', 'photos', 'composition', 'extras'] as const
type Step = typeof STEPS[number]

// Fields to validate per step — essentials first: name, category, price, unit, stock
const STEP_FIELDS: Record<Step, (keyof ProductFormData)[]> = {
  essentials: ['name', 'categoryId', 'pricePerUnit', 'unit', 'stock', 'stockAlertThreshold'],
  photos: [],
  composition: ['ingredients', 'allergens', 'labels', 'origin', 'conservation', 'nutritionalValues'],
  extras: [],
}

const NUTRITION_FIELDS = [
  { key: 'energyKcal', unit: 'kcal' },
  { key: 'fat', unit: 'g' },
  { key: 'saturatedFat', unit: 'g' },
  { key: 'carbohydrates', unit: 'g' },
  { key: 'sugars', unit: 'g' },
  { key: 'fiber', unit: 'g' },
  { key: 'protein', unit: 'g' },
  { key: 'salt', unit: 'g' },
] as const

// ---------- Component ----------

interface ProductFormProps {
  onSubmit: (data: ProductFormData) => void
  isPending: boolean
  initialData?: Partial<ProductFormData>
}

export function ProductForm({ onSubmit, isPending, initialData }: ProductFormProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState<number>(0)
  const [nutritionOpen, setNutritionOpen] = useState<boolean>(
    NUTRITION_FIELDS.some(f => initialData?.nutritionalValues?.[f.key] != null),
  )

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await client.get({ url: '/api/search/categories' })
      return res.data as { categories: Array<{ id: string, name: string, slug: string, imageUrl: string | null }> }
    },
  })
  const categories = categoriesData?.categories ?? []

  const { data: unitsData } = useQuery(fetchActiveProductUnitsQueryOptions())
  const units = unitsData?.items ?? []

  const form = useForm<ProductFormData>({
    resolver: zodResolver(buildProductSchema(t)) as Resolver<ProductFormData>,
    defaultValues: {
      name: initialData?.name ?? '',
      categoryId: initialData?.categoryId ?? '',
      description: initialData?.description ?? '',
      pricePerUnit: initialData?.pricePerUnit ?? 0,
      unit: initialData?.unit ?? '',
      stock: initialData?.stock ?? 0,
      stockAlertThreshold: initialData?.stockAlertThreshold ?? 5,
      status: initialData?.status ?? 'ACTIVE',
      variants: initialData?.variants ?? [],
      hasPromotion: !!initialData?.promotionalPrice,
      promotionalPrice: initialData?.promotionalPrice ?? 0,
      promotionExpiresAt: initialData?.promotionExpiresAt
        ? new Date(initialData.promotionExpiresAt).toISOString().split('T')[0]
        : '',
      mediaIds: initialData?.mediaIds ?? [],
      photos: initialData?.photos ?? [],
      ingredients: initialData?.ingredients ?? '',
      allergens: initialData?.allergens ?? [],
      labels: initialData?.labels ?? [],
      origin: initialData?.origin ?? '',
      conservation: initialData?.conservation ?? '',
      nutritionalValues: {
        basis: initialData?.nutritionalValues?.basis ?? DEFAULT_NUTRITION_BASIS,
        energyKcal: initialData?.nutritionalValues?.energyKcal ?? undefined,
        fat: initialData?.nutritionalValues?.fat ?? undefined,
        saturatedFat: initialData?.nutritionalValues?.saturatedFat ?? undefined,
        carbohydrates: initialData?.nutritionalValues?.carbohydrates ?? undefined,
        sugars: initialData?.nutritionalValues?.sugars ?? undefined,
        fiber: initialData?.nutritionalValues?.fiber ?? undefined,
        protein: initialData?.nutritionalValues?.protein ?? undefined,
        salt: initialData?.nutritionalValues?.salt ?? undefined,
      },
    },
  })

  const { fields: variantFields, append: addVariant, remove: removeVariant } = useFieldArray({
    control: form.control,
    name: 'variants',
  })

  const hasPromotion = form.watch('hasPromotion')
  const pricePerUnit = form.watch('pricePerUnit')
  const keptPhotos = form.watch('photos') ?? []
  const nutritionBasis = form.watch('nutritionalValues.basis') ?? DEFAULT_NUTRITION_BASIS
  const step = STEPS[currentStep]

  // Closed vocabularies: the API only accepts canonical codes
  const allergenOptions = ALLERGEN_CODES.map(code => ({ value: code, label: allergenName(t, code) }))
  const labelOptions = LABEL_CODES.map(code => ({ value: code, label: labelName(t, code) }))

  async function handleNext() {
    const fields = STEP_FIELDS[step]
    // eslint-disable-next-line ts/no-explicit-any
    const valid = fields.length === 0 || await form.trigger(fields as any)
    if (valid && currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  function handleBack() {
    if (currentStep > 0)
      setCurrentStep(currentStep - 1)
  }

  function handleSubmit(data: ProductFormData) {
    onSubmit(data)
  }

  const stepLabels = [
    t('catalog.form.stepEssentials'),
    t('catalog.form.stepPhotos'),
    t('catalog.form.stepComposition'),
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

        {/* ===== Step 1: Essentials (name, category, price, unit, stock) ===== */}
        {step === 'essentials' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold">{t('catalog.form.stepInfo')}</h3>
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

            <div className="pt-2">
              <h3 className="text-base font-semibold">{t('catalog.form.stepPricing')}</h3>
            </div>

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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder={t('catalog.form.unit')} /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {units.map(unit => (
                          <SelectItem key={unit.id} value={unit.code}>{unit.label}</SelectItem>
                        ))}
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
          </div>
        )}

        {/* ===== Step 2: Photos ===== */}
        {step === 'photos' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold">{t('catalog.form.photos')}</h3>
              <p className="text-sm text-muted-foreground">{t('catalog.form.photosDescription')}</p>
            </div>
            <ProductPhotoManager
              keptUrls={keptPhotos}
              onKeptUrlsChange={urls => form.setValue('photos', urls, { shouldDirty: true })}
              onMediaIdsChange={ids => form.setValue('mediaIds', ids, { shouldDirty: true })}
              max={3}
            />
          </div>
        )}

        {/* ===== Step 3: Composition & product sheet ===== */}
        {step === 'composition' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold">{t('catalog.composition.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('catalog.composition.sectionDescription')}</p>
            </div>

            {/* Ingredients */}
            <FormField
              control={form.control}
              name="ingredients"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.composition.ingredients')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder={t('catalog.composition.ingredientsPlaceholder')} rows={3} maxLength={4000} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Allergens */}
            <FormField
              control={form.control}
              name="allergens"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.composition.allergens')}</FormLabel>
                  <FormDescription>{t('catalog.composition.allergensDescription')}</FormDescription>
                  <FormControl>
                    <ChipMultiSelect
                      value={field.value ?? []}
                      onChange={field.onChange}
                      options={allergenOptions}
                      allowCustom={false}
                      maxItems={20}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Labels */}
            <FormField
              control={form.control}
              name="labels"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.composition.labels')}</FormLabel>
                  <FormDescription>{t('catalog.composition.labelsDescription')}</FormDescription>
                  <FormControl>
                    <ChipMultiSelect
                      value={field.value ?? []}
                      onChange={field.onChange}
                      options={labelOptions}
                      allowCustom={false}
                      maxItems={10}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Origin */}
            <FormField
              control={form.control}
              name="origin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.composition.origin')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t('catalog.composition.originPlaceholder')} maxLength={200} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Conservation */}
            <FormField
              control={form.control}
              name="conservation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.composition.conservation')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder={t('catalog.composition.conservationPlaceholder')} rows={2} maxLength={1000} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Nutritional values (collapsible) */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setNutritionOpen(open => !open)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold">{t('catalog.composition.nutrition.title')}</span>
                  <span className="block text-xs text-muted-foreground">{nutritionPerBasis(t, nutritionBasis)}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${nutritionOpen ? 'rotate-180' : ''}`} />
              </button>
              {nutritionOpen && (
                <div className="grid grid-cols-2 gap-4 border-t p-4 sm:grid-cols-4">
                  <FormField
                    control={form.control}
                    name="nutritionalValues.basis"
                    render={({ field }) => (
                      <FormItem className="col-span-2 sm:col-span-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <FormLabel className="text-xs">{t('catalog.composition.basis.label')}</FormLabel>
                          <FormControl>
                            <div role="radiogroup" className="inline-flex rounded-lg border p-0.5">
                              {NUTRITION_BASES.map((basis) => {
                                const selected = field.value === basis
                                return (
                                  <button
                                    key={basis}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => field.onChange(basis)}
                                    className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                                      selected
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    {basisName(t, basis)}
                                  </button>
                                )
                              })}
                            </div>
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {NUTRITION_FIELDS.map(({ key, unit }) => (
                    <FormField
                      key={key}
                      control={form.control}
                      name={`nutritionalValues.${key}`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">{t(`catalog.composition.nutrition.${key}`)}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                value={field.value ?? ''}
                                type="number"
                                min="0"
                                step="any"
                                className="pr-10"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== Step 4: Options (status, variants, promotion) ===== */}
        {step === 'extras' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold">{t('catalog.form.stepExtras')}</h3>
            </div>

            {/* Status */}
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
                      <FormField
                        control={form.control}
                        name={`variants.${index}.label`}
                        render={({ field: f }) => (
                          <FormItem className="flex-1">
                            <FormLabel className="text-xs">{t('catalog.form.variantLabel')}</FormLabel>
                            <FormControl><Input {...f} placeholder="Ex: 0,5 L, 1 L, 5 L" /></FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`variants.${index}.pricePerUnit`}
                        render={({ field: f }) => (
                          <FormItem className="w-32">
                            <FormLabel className="text-xs">{t('catalog.form.variantPrice')}</FormLabel>
                            <FormControl><Input {...f} type="number" min="0" step="100" /></FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`variants.${index}.stock`}
                        render={({ field: f }) => (
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
