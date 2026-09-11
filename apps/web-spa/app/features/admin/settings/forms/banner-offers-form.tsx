import type { BannerOffers } from '@boilerstone/openapi-generator/client/types.gen'
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
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const MIN_OFFERS = 1
const MAX_OFFERS = 6
const MAX_PAID_SLOTS = 5

/** Mirrors the API contract; `z.coerce` absorbs the string inputs. */
const bannerOffersSchema = z.object({
  offers: z.array(z.object({
    days: z.coerce.number().int().min(1).max(365),
    price: z.coerce.number().int().min(0).max(10000000),
  })).min(MIN_OFFERS).max(MAX_OFFERS),
  paidSlots: z.coerce.number().int().min(0).max(MAX_PAID_SLOTS),
})

export type BannerOffersFormData = z.infer<typeof bannerOffersSchema>

interface BannerOffersFormProps {
  offers: BannerOffers
  onSubmit: (offers: BannerOffers) => void
  isPending: boolean
}

/**
 * The duration/price pairs a shop can pick from when it requests a sponsored
 * banner, plus how many sponsored banners the carousel shows at once. Offers
 * are saved sorted by duration, the order the phone lists them in.
 */
export function BannerOffersForm({ offers, onSubmit, isPending }: BannerOffersFormProps) {
  const { t } = useTranslation()

  // Two offers with the same duration would be indistinguishable to the shop.
  const schema = useMemo(() => bannerOffersSchema.superRefine((data, ctx) => {
    const seen = new Set<number>()
    data.offers.forEach((offer, index) => {
      if (seen.has(offer.days)) {
        ctx.addIssue({
          code: 'custom',
          path: ['offers', index, 'days'],
          message: t('admin.settings.bannerOffers.duplicateDays'),
        })
      }
      seen.add(offer.days)
    })
  }), [t])

  const form = useForm<BannerOffersFormData>({
    resolver: zodResolver(schema) as Resolver<BannerOffersFormData>,
    defaultValues: offers,
  })

  const { fields: offerFields, append: appendOffer, remove: removeOffer } = useFieldArray({
    control: form.control,
    name: 'offers',
  })

  // Keep the fields in sync when the offers query refetches.
  useEffect(() => {
    form.reset(offers)
  }, [offers, form])

  const handleSubmit = (data: BannerOffersFormData) => {
    onSubmit({
      offers: [...data.offers].sort((a, b) => a.days - b.days),
      paidSlots: data.paidSlots,
    })
  }

  const handleAddOffer = () => {
    const current = form.getValues('offers')
    const last = current[current.length - 1]
    const lastDays = Number(last?.days) || 0
    const lastPrice = Number(last?.price) || 0
    appendOffer({ days: lastDays + 7, price: lastPrice + 5000 })
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="space-y-3">
          <p className="text-sm font-medium">{t('admin.settings.bannerOffers.offers')}</p>
          {offerFields.map((offer, index) => (
            <div key={offer.id} className="flex flex-wrap items-end gap-2">
              <FormField
                control={form.control}
                name={`offers.${index}.days`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor={`banner-offer-${index}-days`} className="text-muted-foreground text-xs">
                      {t('admin.settings.bannerOffers.days')}
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Input id={`banner-offer-${index}-days`} type="number" min={1} max={365} step={1} className="w-28" {...field} />
                        <span className="text-muted-foreground text-sm">{t('admin.settings.bannerOffers.daysUnit')}</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <span className="text-muted-foreground pb-2 text-sm" aria-hidden="true">→</span>
              <FormField
                control={form.control}
                name={`offers.${index}.price`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor={`banner-offer-${index}-price`} className="text-muted-foreground text-xs">
                      {t('admin.settings.bannerOffers.price')}
                    </FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Input id={`banner-offer-${index}-price`} type="number" min={0} step={1} className="w-36" {...field} />
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
                disabled={offerFields.length <= MIN_OFFERS}
                onClick={() => removeOffer(index)}
                aria-label={t('admin.settings.bannerOffers.remove')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offerFields.length >= MAX_OFFERS}
            onClick={handleAddOffer}
          >
            <Plus className="h-4 w-4" />
            {t('admin.settings.bannerOffers.add')}
          </Button>
          <FormDescription>{t('admin.settings.bannerOffers.offersHint', { max: MAX_OFFERS })}</FormDescription>
        </div>

        <FormField
          control={form.control}
          name="paidSlots"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="banner-offers-paid-slots">{t('admin.settings.bannerOffers.paidSlots')}</FormLabel>
              <FormControl>
                <Input id="banner-offers-paid-slots" type="number" min={0} max={MAX_PAID_SLOTS} step={1} className="w-28" {...field} />
              </FormControl>
              <FormDescription>{t('admin.settings.bannerOffers.paidSlotsHint', { max: MAX_PAID_SLOTS })}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {isPending ? t('common.saving') : t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
