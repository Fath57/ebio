import type { Resolver } from 'react-hook-form'
import type { ExportPack, ExportPackInput, ExportReviewProduct } from '../utils/terroir-types'
import { productsControllerFindById } from '@boilerstone/openapi-generator/client/sdk.gen'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@boilerstone/ui/components/primitives/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueries } from '@tanstack/react-query'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ProductThumb } from '@/features/admin/common/components/product-thumb'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { PackBalance } from '../components/pack-balance'
import { formatGrams } from '../utils/terroir-format'

const MAX_ITEMS = 20

const packSchema = z.object({
  name: z.string().trim().min(2, 'admin.terroir.validation.nameMin').max(120),
  description: z.string().trim().max(2000),
  price: z.string().trim().regex(/^\d{1,8}$/, 'admin.terroir.validation.price').refine(value => Number(value) > 0, 'admin.terroir.validation.price'),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().nullable(),
    quantity: z.coerce.number().int().min(1).max(100),
  })).min(1, 'admin.terroir.validation.packItems').max(MAX_ITEMS),
})

type PackFormData = z.infer<typeof packSchema>

/** What the picker knows of a product: the approved export queue, plus the lines of the pack edited. */
interface PickableProduct {
  productId: string
  name: string
  imageUrl: string | null
  shopName: string
}

interface PackFormDialogProps {
  /** Null: a new eBio pack. */
  pack: ExportPack | null
  /** Products approved for export, from every shop. */
  approved: ExportReviewProduct[]
  isPending: boolean
  error: string | null
  onSubmit: (input: ExportPackInput) => void
  onClose: () => void
}

/** Today's shop price of each picked product; the API answers products as `unknown`. */
function usePrices(productIds: string[], known: Map<string, number>) {
  const missing = productIds.filter(id => !known.has(id))
  const results = useQueries({
    queries: missing.map(id => ({
      queryKey: ['admin', 'terroir', 'product-price', id],
      queryFn: async () => {
        const response = await productsControllerFindById({ path: { id } })
        if (response.error)
          throw new Error('Failed to load product')
        const product = response.data as { price?: unknown }
        return Number(product.price ?? 0)
      },
      staleTime: 60_000,
    })),
  })
  const prices = new Map(known)
  missing.forEach((id, index) => {
    const price = results[index]?.data
    if (price != null)
      prices.set(id, price)
  })
  return prices
}

/**
 * An eBio pack: products from several shops sold together. Each shop is paid
 * its own price; the gap between the pack price and the sum of the lines is
 * shown live — eBio's margin above, its compensation below.
 */
export function PackFormDialog({ pack, approved, isPending, error, onSubmit, onClose }: PackFormDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const form = useForm<PackFormData>({
    resolver: zodResolver(packSchema) as Resolver<PackFormData>,
    defaultValues: {
      name: pack?.name ?? '',
      description: pack?.description ?? '',
      price: pack ? String(pack.price) : '',
      items: pack?.items.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })) ?? [],
    },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' })

  const catalogue = useMemo(() => {
    const map = new Map<string, PickableProduct>()
    for (const item of pack?.items ?? [])
      map.set(item.productId, { productId: item.productId, name: item.name, imageUrl: item.imageUrl, shopName: item.shopName })
    for (const product of approved)
      map.set(product.productId, { productId: product.productId, name: product.productName, imageUrl: product.imageUrl, shopName: product.shopName })
    return map
  }, [pack, approved])

  const knownPrices = useMemo(() => new Map((pack?.items ?? []).map(item => [item.productId, item.unitPrice])), [pack])
  const items = form.watch('items')
  const prices = usePrices(items.map(item => item.productId), knownPrices)
  const linesTotal = items.reduce((total, item) => total + (prices.get(item.productId) ?? 0) * Number(item.quantity || 0), 0)
  const pricesReady = items.every(item => prices.has(item.productId))
  const price = Number(form.watch('price') || 0)

  const pickedIds = new Set(items.map(item => item.productId))
  const needle = search.trim().toLowerCase()
  const candidates = approved
    .filter(product => !pickedIds.has(product.productId))
    .filter(product => !needle || `${product.productName} ${product.shopName}`.toLowerCase().includes(needle))
    .slice(0, 12)

  const submit = (values: PackFormData) => {
    onSubmit({
      name: values.name.trim(),
      description: values.description.trim() || null,
      photos: pack?.photos ?? [],
      price: Number(values.price),
      items: values.items.map(item => ({ productId: item.productId, variantId: item.variantId, quantity: Number(item.quantity) })),
    })
  }

  const itemsError = form.formState.errors.items?.message ?? form.formState.errors.items?.root?.message

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next)
          onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{pack ? t('admin.terroir.packs.editTitle') : t('admin.terroir.packs.createTitle')}</DialogTitle>
          <DialogDescription>{t('admin.terroir.packs.formDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <FormField
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.packs.fields.name')}</FormLabel>
                    <FormControl><Input {...field} maxLength={120} /></FormControl>
                    {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('admin.terroir.packs.fields.price')}</FormLabel>
                    <FormControl><Input {...field} inputMode="numeric" /></FormControl>
                    {fieldState.error?.message && <p className="text-destructive text-sm">{t(fieldState.error.message)}</p>}
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.terroir.packs.fields.description')}</FormLabel>
                  <FormControl><Textarea {...field} rows={2} maxLength={2000} /></FormControl>
                </FormItem>
              )}
            />

            <fieldset className="space-y-3">
              <legend className="font-semibold">{t('admin.terroir.packs.composition')}</legend>
              {fields.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.terroir.packs.noItems')}</p>}
              <ul className="divide-y rounded-md border">
                {fields.map((field, index) => {
                  const product = catalogue.get(field.productId)
                  const unitPrice = prices.get(field.productId)
                  return (
                    <li key={field.id} className="flex items-center gap-3 p-2">
                      <ProductThumb url={product?.imageUrl ?? null} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{product?.name ?? field.productId}</p>
                        <p className="text-muted-foreground text-xs">
                          {product?.shopName}
                          {unitPrice != null && ` · ${formatAmount(unitPrice)}`}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        className="w-20"
                        aria-label={t('admin.terroir.packs.quantityOf', { name: product?.name ?? '' })}
                        {...form.register(`items.${index}.quantity`)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('admin.terroir.packs.removeItem', { name: product?.name ?? '' })}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
              {itemsError && <p className="text-destructive text-sm">{t(itemsError)}</p>}

              {fields.length < MAX_ITEMS && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
                    <Input
                      value={search}
                      className="pl-9"
                      placeholder={t('admin.terroir.packs.searchPlaceholder')}
                      aria-label={t('admin.terroir.packs.searchPlaceholder')}
                      onChange={event => setSearch(event.target.value)}
                    />
                  </div>
                  {approved.length === 0 && <p className="text-muted-foreground text-sm">{t('admin.terroir.packs.noApproved')}</p>}
                  <ul className="max-h-60 divide-y overflow-y-auto rounded-md border">
                    {candidates.map(product => (
                      <li key={product.productId} className="flex items-center gap-3 p-2">
                        <ProductThumb url={product.imageUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{product.productName}</p>
                          <p className="text-muted-foreground text-xs">{`${product.shopName} · ${formatGrams(product.packedWeightG)}`}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => append({ productId: product.productId, variantId: null, quantity: 1 })}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          {t('admin.terroir.packs.addItem')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </fieldset>

            {items.length > 0 && (
              <div className="bg-muted/40 space-y-1 rounded-md border p-3">
                <PackBalance price={price} linesTotal={linesTotal} />
                {!pricesReady && <p className="text-muted-foreground text-xs">{t('admin.terroir.packs.pricesLoading')}</p>}
              </div>
            )}

            {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={isPending}>{isPending ? t('common.saving') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
