import type { Resolver } from 'react-hook-form'
import type { PickerOption } from '../components/entity-picker'
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
import { Link as LinkIcon, Megaphone, Package, Store } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { BannerImageField } from '../components/banner-image-field'
import { BannerPreview } from '../components/banner-preview'
import { EntityPicker } from '../components/entity-picker'
import { searchProducts, searchSuppliers } from '../utils/target-search'

const bannerSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  imageUrl: z.string().min(1),
  targetType: z.enum(['SUPPLIER', 'PRODUCT', 'URL', 'NONE']),
  targetId: z.string(),
  targetUrl: z.string(),
  isActive: z.boolean(),
  position: z.coerce.number().int().min(0),
}).superRefine((data, ctx) => {
  // Each type carries its own destination field.
  if ((data.targetType === 'SUPPLIER' || data.targetType === 'PRODUCT') && !data.targetId) {
    ctx.addIssue({ code: 'custom', path: ['targetId'], message: 'Choisissez une destination' })
  }
  if (data.targetType === 'URL' && !/^https?:\/\/.+/.test(data.targetUrl)) {
    ctx.addIssue({ code: 'custom', path: ['targetUrl'], message: 'Entrez un lien complet, en https://' })
  }
})

export type BannerFormData = z.infer<typeof bannerSchema>

interface BannerFormProps {
  onSubmit: (data: BannerFormData) => void
  isPending: boolean
  initialData?: Partial<BannerFormData>
  /** Label and picture of the target being edited, so the picker opens filled. */
  initialTarget?: PickerOption | null
}

const TARGET_TYPES: Array<{ value: BannerTargetType, icon: typeof Store }> = [
  { value: 'SUPPLIER', icon: Store },
  { value: 'PRODUCT', icon: Package },
  { value: 'URL', icon: LinkIcon },
  { value: 'NONE', icon: Megaphone },
]

export const BannerForm: React.FC<BannerFormProps> = ({
  onSubmit,
  isPending,
  initialData,
  initialTarget,
}) => {
  const { t } = useTranslation()
  const [target, setTarget] = React.useState<PickerOption | null>(initialTarget ?? null)

  const form = useForm<BannerFormData>({
    resolver: zodResolver(bannerSchema) as Resolver<BannerFormData>,
    defaultValues: {
      title: initialData?.title ?? '',
      subtitle: initialData?.subtitle ?? '',
      imageUrl: initialData?.imageUrl ?? '',
      targetType: initialData?.targetType ?? 'SUPPLIER',
      targetId: initialData?.targetId ?? '',
      targetUrl: initialData?.targetUrl ?? '',
      isActive: initialData?.isActive ?? true,
      position: initialData?.position ?? 0,
    },
  })

  const targetType = form.watch('targetType') as BannerTargetType
  const targetId = form.watch('targetId')
  const imageUrl = form.watch('imageUrl')
  const title = form.watch('title')
  const subtitle = form.watch('subtitle')

  // Bound per type so switching the type re-runs the right search.
  const handleSearch = React.useCallback(
    (query: string) => (targetType === 'SUPPLIER' ? searchSuppliers(query) : searchProducts(query)),
    [targetType],
  )

  function handleSelectTarget(option: PickerOption) {
    setTarget(option)
    form.setValue('targetId', option.id, { shouldValidate: true })
    // A banner usually carries the name of what it points at; offering it saves
    // retyping, without overwriting a title the editor already wrote.
    if (!form.getValues('title')) {
      form.setValue('title', option.label)
    }
    if (!form.getValues('subtitle') && option.context) {
      form.setValue('subtitle', option.context)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-8 lg:grid-cols-[1fr_auto]">
        <div className="space-y-6">
          <FormField
            control={form.control}
            name="targetType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('admin.banners.form.targetType')}</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-3">
                    {TARGET_TYPES.map(({ value, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          field.onChange(value)
                          // The previous destination belongs to the other type.
                          form.setValue('targetId', '')
                          form.setValue('targetUrl', '')
                          setTarget(null)
                        }}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          field.value === value
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent/40'
                        }`}
                      >
                        <Icon className={field.value === value ? 'text-primary h-5 w-5' : 'text-muted-foreground h-5 w-5'} />
                        <span className="text-sm font-medium">
                          {t(`admin.banners.targetType.${value}`)}
                        </span>
                      </button>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {(targetType === 'SUPPLIER' || targetType === 'PRODUCT') && (
            <FormField
              control={form.control}
              name="targetId"
              render={() => (
                <FormItem>
                  <FormLabel>{t('admin.banners.form.target')}</FormLabel>
                  <FormControl>
                    <EntityPicker
                      value={targetId}
                      selected={target}
                      placeholder={t(`admin.banners.form.pick.${targetType}`)}
                      searchPlaceholder={t(`admin.banners.form.search.${targetType}`)}
                      emptyLabel={t('admin.banners.form.noResult')}
                      onSearch={handleSearch}
                      onSelect={handleSelectTarget}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {targetType === 'URL' && (
            <FormField
              control={form.control}
              name="targetUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('admin.banners.form.targetUrl')}</FormLabel>
                  <FormControl>
                    <Input {...field} type="url" placeholder="https://…" />
                  </FormControl>
                  <FormDescription>{t('admin.banners.form.targetUrlHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {targetType === 'NONE' && (
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm">
              {t('admin.banners.form.noneHint')}
            </p>
          )}

          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('admin.banners.form.image')}</FormLabel>
                <FormControl>
                  <BannerImageField
                    value={field.value}
                    onChange={url => form.setValue('imageUrl', url, { shouldValidate: true })}
                  />
                </FormControl>
                <FormDescription>{t('admin.banners.form.imageHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('admin.banners.form.title')}</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={60} />
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
                  <Input {...field} maxLength={80} />
                </FormControl>
                <FormDescription>{t('admin.banners.form.subtitleHint')}</FormDescription>
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
        </div>

        <div className="lg:sticky lg:top-6 lg:h-fit lg:w-80">
          <BannerPreview imageUrl={imageUrl} title={title} subtitle={subtitle} />
        </div>
      </form>
    </Form>
  )
}
