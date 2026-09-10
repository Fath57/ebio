import type { DeliveryPricingConfig } from '@boilerstone/openapi-generator/client/types.gen'
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
import { cn } from '@boilerstone/ui/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { previewFee } from '../utils/delivery-pricing-preview'

const MODES = ['FLAT', 'DISTANCE', 'ZONES'] as const
const MAX_ZONES = 10
const PREVIEW_DISTANCES_KM = [2, 5, 12]

/** Integer FCFA amount, same bounds as the API contract. */
const feeSchema = z.coerce.number().int().min(0).max(1000000)

/** Mirrors `zDeliveryPricingConfig`; `z.coerce` absorbs the string inputs. */
const deliveryPricingSchema = z.object({
  mode: z.enum(MODES),
  flat: z.object({ fee: feeSchema }),
  distance: z.object({
    baseFee: feeSchema,
    perKm: feeSchema,
    minFee: feeSchema,
    maxFee: feeSchema,
    roundTo: z.coerce.number().int().min(1).max(10000),
  }),
  zones: z.array(z.object({
    maxKm: z.coerce.number().min(0.1).max(500),
    fee: feeSchema,
  })).min(1).max(MAX_ZONES),
  // Empty means delivery is never waived, which the API stores as null.
  freeFrom: z.coerce.number().int().min(0).nullable(),
  maxDistanceKm: z.coerce.number().min(0.5).max(500),
})

export type DeliveryPricingFormData = z.infer<typeof deliveryPricingSchema>

interface DeliveryPricingFormProps {
  config: DeliveryPricingConfig
  onSubmit: (config: DeliveryPricingConfig) => void
  isPending: boolean
}

/** Lenient number read for the live preview: half-typed fields fall back. */
function toNumber(value: unknown, fallback: number): number {
  if (value === '' || value === null || value === undefined)
    return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Turns the raw (possibly string-valued) form state into a config the
 * preview can price, without waiting for the form to be fully valid.
 */
function toPreviewConfig(values: DeliveryPricingFormData): DeliveryPricingConfig {
  return {
    mode: values.mode,
    flat: { fee: toNumber(values.flat?.fee, 0) },
    distance: {
      baseFee: toNumber(values.distance?.baseFee, 0),
      perKm: toNumber(values.distance?.perKm, 0),
      minFee: toNumber(values.distance?.minFee, 0),
      maxFee: toNumber(values.distance?.maxFee, Number.MAX_SAFE_INTEGER),
      roundTo: toNumber(values.distance?.roundTo, 1),
    },
    zones: (values.zones ?? []).map(zone => ({
      maxKm: toNumber(zone.maxKm, 0),
      fee: toNumber(zone.fee, 0),
    })),
    freeFrom: null,
    maxDistanceKm: toNumber(values.maxDistanceKm, Number.MAX_SAFE_INTEGER),
  }
}

/**
 * Platform-wide delivery pricing: one mode at a time (flat, per-distance or
 * rings), plus the free-delivery threshold and the served radius. Only the
 * fields of the selected mode are shown; the other modes keep their values so
 * switching back and forth loses nothing.
 */
export function DeliveryPricingForm({ config, onSubmit, isPending }: DeliveryPricingFormProps) {
  const { t } = useTranslation()

  // The min/max consistency rule needs a translated message, hence the memo.
  const schema = useMemo(() => deliveryPricingSchema.refine(
    data => data.distance.minFee <= data.distance.maxFee,
    { path: ['distance', 'minFee'], message: t('admin.settings.deliveryPricing.distance.minMaxError') },
  ), [t])

  const form = useForm<DeliveryPricingFormData>({
    resolver: zodResolver(schema) as Resolver<DeliveryPricingFormData>,
    defaultValues: config,
  })

  const { fields: zoneFields, append: appendZone, remove: removeZone } = useFieldArray({
    control: form.control,
    name: 'zones',
  })

  // Keep the fields in sync when the pricing query refetches.
  useEffect(() => {
    form.reset(config)
  }, [config, form])

  const mode = form.watch('mode')
  const watched = form.watch()
  const previewConfig = toPreviewConfig(watched)

  const handleSubmit = (data: DeliveryPricingFormData) => {
    onSubmit({
      ...data,
      zones: [...data.zones].sort((a, b) => a.maxKm - b.maxKm),
    })
  }

  const handleAddZone = () => {
    const last = watched.zones?.[watched.zones.length - 1]
    appendZone({
      maxKm: toNumber(last?.maxKm, 0) + 5,
      fee: toNumber(last?.fee, 0) + 500,
    })
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.settings.deliveryPricing.mode.label')}</FormLabel>
              <FormControl>
                <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
                  {MODES.map(option => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={field.value === option}
                      onClick={() => field.onChange(option)}
                      className={cn(
                        'rounded-md border p-3 text-left transition-colors',
                        'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
                        field.value === option
                          ? 'border-primary bg-primary/5'
                          : 'border-input hover:bg-accent',
                      )}
                    >
                      <span className="block text-sm font-medium">
                        {t(`admin.settings.deliveryPricing.mode.${option.toLowerCase()}`)}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {t(`admin.settings.deliveryPricing.mode.${option.toLowerCase()}Hint`)}
                      </span>
                    </button>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {mode === 'FLAT' && (
          <FormField
            control={form.control}
            name="flat.fee"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="delivery-pricing-flat-fee">{t('admin.settings.deliveryPricing.flat.fee')}</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <Input id="delivery-pricing-flat-fee" type="number" min={0} step={1} className="w-36" {...field} />
                    <span className="text-muted-foreground text-sm">FCFA</span>
                  </div>
                </FormControl>
                <FormDescription>{t('admin.settings.deliveryPricing.flat.feeHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {mode === 'DISTANCE' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="distance.baseFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="delivery-pricing-base-fee">{t('admin.settings.deliveryPricing.distance.baseFee')}</FormLabel>
                  <FormControl>
                    <Input id="delivery-pricing-base-fee" type="number" min={0} step={1} {...field} />
                  </FormControl>
                  <FormDescription>{t('admin.settings.deliveryPricing.distance.baseFeeHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="distance.perKm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="delivery-pricing-per-km">{t('admin.settings.deliveryPricing.distance.perKm')}</FormLabel>
                  <FormControl>
                    <Input id="delivery-pricing-per-km" type="number" min={0} step={1} {...field} />
                  </FormControl>
                  <FormDescription>{t('admin.settings.deliveryPricing.distance.perKmHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="distance.roundTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="delivery-pricing-round-to">{t('admin.settings.deliveryPricing.distance.roundTo')}</FormLabel>
                  <FormControl>
                    <Input id="delivery-pricing-round-to" type="number" min={1} step={1} {...field} />
                  </FormControl>
                  <FormDescription>{t('admin.settings.deliveryPricing.distance.roundToHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="distance.minFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="delivery-pricing-min-fee">{t('admin.settings.deliveryPricing.distance.minFee')}</FormLabel>
                  <FormControl>
                    <Input id="delivery-pricing-min-fee" type="number" min={0} step={1} {...field} />
                  </FormControl>
                  <FormDescription>{t('admin.settings.deliveryPricing.distance.minFeeHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="distance.maxFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="delivery-pricing-max-fee">{t('admin.settings.deliveryPricing.distance.maxFee')}</FormLabel>
                  <FormControl>
                    <Input id="delivery-pricing-max-fee" type="number" min={0} step={1} {...field} />
                  </FormControl>
                  <FormDescription>{t('admin.settings.deliveryPricing.distance.maxFeeHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {mode === 'ZONES' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t('admin.settings.deliveryPricing.zones.label')}</p>
            {zoneFields.map((zone, index) => (
              <div key={zone.id} className="flex flex-wrap items-end gap-2">
                <FormField
                  control={form.control}
                  name={`zones.${index}.maxKm`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor={`delivery-pricing-zone-${index}-km`} className="text-muted-foreground text-xs">
                        {t('admin.settings.deliveryPricing.zones.upTo')}
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input id={`delivery-pricing-zone-${index}-km`} type="number" min={0.1} max={500} step={0.1} className="w-28" {...field} />
                          <span className="text-muted-foreground text-sm">km</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <span className="text-muted-foreground pb-2 text-sm" aria-hidden="true">→</span>
                <FormField
                  control={form.control}
                  name={`zones.${index}.fee`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor={`delivery-pricing-zone-${index}-fee`} className="text-muted-foreground text-xs">
                        {t('admin.settings.deliveryPricing.zones.fee')}
                      </FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input id={`delivery-pricing-zone-${index}-fee`} type="number" min={0} step={1} className="w-32" {...field} />
                          <span className="text-muted-foreground text-sm">FCFA</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={zoneFields.length <= 1}
                  onClick={() => removeZone(index)}
                  aria-label={t('admin.settings.deliveryPricing.zones.remove')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={zoneFields.length >= MAX_ZONES}
              onClick={handleAddZone}
            >
              <Plus className="h-4 w-4" />
              {t('admin.settings.deliveryPricing.zones.add')}
            </Button>
            <FormDescription>{t('admin.settings.deliveryPricing.zones.hint', { max: MAX_ZONES })}</FormDescription>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="freeFrom"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="delivery-pricing-free-from">{t('admin.settings.deliveryPricing.freeFrom')}</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <Input
                      id="delivery-pricing-free-from"
                      type="number"
                      min={0}
                      step={1}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value ?? ''}
                      // An empty field disables the waiver rather than reading
                      // as 0, which would make every delivery free.
                      onChange={event => field.onChange(event.target.value === '' ? null : event.target.value)}
                    />
                    <span className="text-muted-foreground text-sm">FCFA</span>
                  </div>
                </FormControl>
                <FormDescription>{t('admin.settings.deliveryPricing.freeFromHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxDistanceKm"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="delivery-pricing-max-distance">{t('admin.settings.deliveryPricing.maxDistanceKm')}</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-2">
                    <Input id="delivery-pricing-max-distance" type="number" min={0.5} max={500} step={0.5} {...field} />
                    <span className="text-muted-foreground text-sm">km</span>
                  </div>
                </FormControl>
                <FormDescription>{t('admin.settings.deliveryPricing.maxDistanceKmHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <p className="text-muted-foreground text-sm" aria-live="polite">
          <span className="font-medium">{t('admin.settings.deliveryPricing.preview.title')}</span>
          {' '}
          {PREVIEW_DISTANCES_KM.map((km, index) => {
            const fee = previewFee(previewConfig, km)
            const label = fee === null
              ? t('admin.settings.deliveryPricing.preview.outOfRange', { km })
              : t('admin.settings.deliveryPricing.preview.item', { km, fee: fee.toLocaleString('fr-FR') })
            return (
              <span key={km}>
                {index > 0 && ' · '}
                {label}
              </span>
            )
          })}
        </p>

        <Button type="submit" disabled={isPending}>
          {isPending ? t('common.saving') : t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
