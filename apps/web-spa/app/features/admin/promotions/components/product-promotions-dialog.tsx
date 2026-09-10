import type { CreateProductPromotionInput, ProductPromotion, PromotionType } from '../utils/promotions-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
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
import { Separator } from '@boilerstone/ui/components/primitives/separator'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import {
  createProductPromotion,
  fetchProductPromotionsQueryOptions,
  productPromotionsQueryKey,
  PROMOTION_TYPES,
  removeProductPromotion,
} from '../utils/promotions-queries'

/** What the dialog needs to know about the product it manages. */
export interface PromotedProduct {
  id: string
  name: string
  pricePerUnit: number
}

interface ProductPromotionsDialogProps {
  product: PromotedProduct | null
  onClose: () => void
}

const QTY_PATTERN = /^\d+$/

/**
 * Inputs stay strings so an empty conditional field is simply "not filled";
 * numbers are produced at submit time. Messages come from i18n, hence the
 * factory.
 */
type Translate = ReturnType<typeof useTranslation>['t']

function buildPromotionFormSchema(t: Translate, regularPrice: number) {
  return z.object({
    type: z.enum(['PRICE', 'BOGO', 'FREE_DELIVERY']),
    promoPrice: z.string(),
    buyQty: z.string(),
    getQty: z.string(),
    endsAt: z.string(),
  }).superRefine((values, ctx) => {
    if (values.type === 'PRICE') {
      const price = Number(values.promoPrice)
      if (values.promoPrice.trim() === '' || Number.isNaN(price) || price < 0) {
        ctx.addIssue({ code: 'custom', path: ['promoPrice'], message: t('admin.promotions.errors.promoPriceRequired') })
      }
      else if (price >= regularPrice) {
        ctx.addIssue({ code: 'custom', path: ['promoPrice'], message: t('admin.promotions.errors.promoPriceTooHigh') })
      }
    }
    if (values.type === 'BOGO') {
      for (const field of ['buyQty', 'getQty'] as const) {
        const qty = Number(values[field])
        if (!QTY_PATTERN.test(values[field].trim()) || qty < 1 || qty > 20)
          ctx.addIssue({ code: 'custom', path: [field], message: t('admin.promotions.errors.qtyRange') })
      }
    }
    if (values.endsAt !== '' && new Date(values.endsAt).getTime() <= Date.now()) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: t('admin.promotions.errors.endsAtPast') })
    }
  })
}

type PromotionFormValues = z.infer<ReturnType<typeof buildPromotionFormSchema>>

const DEFAULT_VALUES: PromotionFormValues = {
  type: 'PRICE',
  promoPrice: '',
  buyQty: '1',
  getQty: '1',
  endsAt: '',
}

function toCreateInput(values: PromotionFormValues): CreateProductPromotionInput {
  const input: CreateProductPromotionInput = { type: values.type }
  if (values.type === 'PRICE')
    input.promoPrice = Number(values.promoPrice)
  if (values.type === 'BOGO') {
    input.buyQty = Number(values.buyQty)
    input.getQty = Number(values.getQty)
  }
  if (values.endsAt !== '')
    input.endsAt = new Date(values.endsAt).toISOString()
  return input
}

function formatAmount(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

interface PromotionRowProps {
  promotion: ProductPromotion
  isRemoving: boolean
  onRemove: (promotionId: string) => void
}

function PromotionRow({ promotion, isRemoving, onRemove }: PromotionRowProps) {
  const { t, i18n } = useTranslation()
  const formatDate = (value: string) => new Date(value).toLocaleDateString(i18n.language)
  // The server computes `isActive` against the clock; an inactive promotion
  // with an end date has ended, the rest is simply switched off.
  const expired = !promotion.isActive && promotion.endsAt !== null

  let value: string | null = null
  if (promotion.type === 'PRICE' && promotion.promoPrice !== null)
    value = formatAmount(promotion.promoPrice)
  if (promotion.type === 'BOGO')
    value = t('admin.promotions.bogoValue', { buy: promotion.buyQty ?? 1, get: promotion.getQty ?? 1 })

  return (
    <li className={`flex items-start justify-between gap-3 py-2 ${promotion.isActive ? '' : 'opacity-60'}`}>
      <div className="min-w-0 space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t(`admin.promotions.types.${promotion.type}`)}</span>
          {value && <span>{value}</span>}
          <Badge variant={promotion.createdBy === 'PLATFORM' ? 'default' : 'outline'}>
            {t(`admin.promotions.origin.${promotion.createdBy}`)}
          </Badge>
          {!promotion.isActive && (
            <Badge variant="secondary">
              {t(expired ? 'admin.promotions.expired' : 'admin.promotions.inactive')}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {t('admin.promotions.from', { date: formatDate(promotion.startsAt) })}
          {' '}
          {promotion.endsAt
            ? t('admin.promotions.until', { date: formatDate(promotion.endsAt) })
            : t('admin.promotions.noEnd')}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('admin.promotions.remove')}
        disabled={isRemoving}
        onClick={() => onRemove(promotion.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  )
}

export function ProductPromotionsDialog({ product, onClose }: ProductPromotionsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const productId = product?.id ?? ''
  const regularPrice = product?.pricePerUnit ?? 0

  const { data: promotions, isLoading } = useQuery({
    ...fetchProductPromotionsQueryOptions(productId),
    enabled: Boolean(productId),
  })

  const schema = useMemo(() => buildPromotionFormSchema(t, regularPrice), [t, regularPrice])
  const form = useForm<PromotionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })
  const selectedType = form.watch('type')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: productPromotionsQueryKey(productId) })
    // The supplier's product list shows live promotion badges.
    queryClient.invalidateQueries({ queryKey: ['admin', 'suppliers'] })
  }

  const create = useMutation({
    mutationFn: (values: PromotionFormValues) => createProductPromotion(productId, toCreateInput(values)),
    onSuccess: () => {
      toast.success(t('admin.promotions.created'))
      form.reset(DEFAULT_VALUES)
      invalidate()
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  const remove = useMutation({
    mutationFn: (promotionId: string) => removeProductPromotion(productId, promotionId),
    onSuccess: () => {
      toast.success(t('admin.promotions.removed'))
      invalidate()
    },
    onError: (error: Error) => {
      toast.error(error.message || t('common.error'))
    },
  })

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset(DEFAULT_VALUES)
      onClose()
    }
  }

  return (
    <Dialog open={product !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admin.promotions.dialogTitle', { name: product?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('admin.promotions.dialogDescription')}</DialogDescription>
        </DialogHeader>

        {isLoading
          ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )
          : promotions && promotions.length > 0
            ? (
                <ul className="divide-y">
                  {promotions.map(promotion => (
                    <PromotionRow
                      key={promotion.id}
                      promotion={promotion}
                      isRemoving={remove.isPending}
                      onRemove={remove.mutate}
                    />
                  ))}
                </ul>
              )
            : (
                <p className="text-muted-foreground text-sm">{t('admin.promotions.empty')}</p>
              )}

        <Separator />

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(values => create.mutate(values))}>
            <div>
              <h3 className="text-sm font-semibold">{t('admin.promotions.form.title')}</h3>
              <p className="text-muted-foreground text-xs">{t('admin.promotions.form.replaceHint')}</p>
            </div>

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.promotions.form.type')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROMOTION_TYPES.map((type: PromotionType) => (
                        <SelectItem key={type} value={type}>
                          {t(`admin.promotions.types.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedType === 'PRICE' && (
              <FormField
                control={form.control}
                name="promoPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admin.promotions.form.promoPrice')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} step={1} inputMode="numeric" />
                    </FormControl>
                    <FormDescription>
                      {t('admin.promotions.form.regularPrice', { price: formatAmount(regularPrice) })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {selectedType === 'BOGO' && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="buyQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('admin.promotions.form.buyQty')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={1} max={20} step={1} inputMode="numeric" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="getQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('admin.promotions.form.getQty')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={1} max={20} step={1} inputMode="numeric" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.promotions.form.endsAt')}</FormLabel>
                  <FormControl>
                    <Input {...field} type="datetime-local" />
                  </FormControl>
                  <FormDescription>{t('admin.promotions.form.endsAtHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
                {t('common.close')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? t('common.saving') : t('admin.promotions.form.submit')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
