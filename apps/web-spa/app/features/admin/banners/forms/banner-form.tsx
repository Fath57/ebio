import type { Resolver } from 'react-hook-form'
import type { BannerTargetType } from '../utils/banners-queries'
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
import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { fetchAdminSuppliersQueryOptions } from '@/features/admin/suppliers/utils/suppliers-queries'
import { ImageUpload } from '@/features/media/components/image-upload'

const bannerSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  imageUrl: z.string().min(1),
  targetType: z.enum(['SUPPLIER', 'PRODUCT']),
  targetId: z.string().uuid(),
  isActive: z.boolean(),
  position: z.coerce.number().int().min(0),
})

export type BannerFormData = z.infer<typeof bannerSchema>

interface BannerFormProps {
  onSubmit: (data: BannerFormData) => void
  isPending: boolean
  initialData?: Partial<BannerFormData>
}

export const BannerForm: React.FC<BannerFormProps> = ({ onSubmit, isPending, initialData }) => {
  const { t } = useTranslation()
  const form = useForm<BannerFormData>({
    resolver: zodResolver(bannerSchema) as Resolver<BannerFormData>,
    defaultValues: {
      title: initialData?.title ?? '',
      subtitle: initialData?.subtitle ?? '',
      imageUrl: initialData?.imageUrl ?? '',
      targetType: initialData?.targetType ?? 'SUPPLIER',
      targetId: initialData?.targetId ?? '',
      isActive: initialData?.isActive ?? true,
      position: initialData?.position ?? 0,
    },
  })

  const targetType = form.watch('targetType') as BannerTargetType

  // Liste large : le back-office compte peu de fournisseurs, un select suffit.
  const { data: suppliers } = useQuery({
    ...fetchAdminSuppliersQueryOptions({ page: 1 }),
    enabled: targetType === 'SUPPLIER',
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.banners.form.title')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="subtitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.banners.form.subtitle')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>{t('admin.banners.form.subtitleHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.banners.form.image')}</FormLabel>
              <FormControl>
                <ImageUpload
                  context="BANNER_IMAGE"
                  initialUrl={field.value || undefined}
                  onUrlChange={url => form.setValue('imageUrl', url ?? '')}
                />
              </FormControl>
              <FormDescription>{t('admin.banners.form.imageHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="targetType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.banners.form.targetType')}</FormLabel>
              <FormControl>
                <select
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  value={field.value}
                  onChange={(event) => {
                    field.onChange(event.target.value)
                    // La cible précédente n'a plus de sens si le type change.
                    form.setValue('targetId', '')
                  }}
                >
                  <option value="SUPPLIER">{t('admin.banners.targetType.SUPPLIER')}</option>
                  <option value="PRODUCT">{t('admin.banners.targetType.PRODUCT')}</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="targetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.banners.form.target')}</FormLabel>
              <FormControl>
                {targetType === 'SUPPLIER'
                  ? (
                      <select
                        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                        value={field.value}
                        onChange={event => field.onChange(event.target.value)}
                      >
                        <option value="">{t('admin.banners.form.selectSupplier')}</option>
                        {(suppliers?.items ?? []).map(supplier => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.shopName}
                          </option>
                        ))}
                      </select>
                    )
                  : <Input {...field} placeholder={t('admin.banners.form.productIdPlaceholder')} />}
              </FormControl>
              <FormDescription>
                {targetType === 'PRODUCT' ? t('admin.banners.form.productIdHint') : null}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="position"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('admin.banners.form.position')}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} {...field} />
                </FormControl>
                <FormDescription>{t('admin.banners.form.positionHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-col justify-center gap-2">
                <FormLabel>{t('admin.banners.form.isActive')}</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormDescription>{t('admin.banners.form.isActiveHint')}</FormDescription>
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? t('common.saving') : t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
