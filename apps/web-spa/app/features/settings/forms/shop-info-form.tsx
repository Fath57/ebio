import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const shopInfoSchema = z.object({
  shopName: z.string().min(2).max(100),
  address: z.string().min(2).max(255),
  neighborhood: z.string().min(2).max(100),
  mobileMoneyNumber: z.string().min(8).max(20),
})

export type ShopInfoFormData = z.infer<typeof shopInfoSchema>

interface ShopInfoFormProps {
  onSubmit: (data: ShopInfoFormData) => void
  isPending: boolean
  initialData?: Partial<ShopInfoFormData>
}

export function ShopInfoForm({ onSubmit, isPending, initialData }: ShopInfoFormProps) {
  const { t } = useTranslation()
  const form = useForm<ShopInfoFormData>({
    resolver: zodResolver(shopInfoSchema),
    defaultValues: {
      shopName: '',
      address: '',
      neighborhood: '',
      mobileMoneyNumber: '',
    },
  })

  useEffect(() => {
    if (initialData) {
      form.reset({
        shopName: initialData.shopName ?? '',
        address: initialData.address ?? '',
        neighborhood: initialData.neighborhood ?? '',
        mobileMoneyNumber: initialData.mobileMoneyNumber ?? '',
      })
    }
  }, [initialData, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="shopName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.shopInfo.shopName')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('settings.shopInfo.shopNamePlaceholder')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.shopInfo.address')}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t('settings.shopInfo.addressPlaceholder')} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="neighborhood"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.shopInfo.neighborhood')}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t('settings.shopInfo.neighborhoodPlaceholder')} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="mobileMoneyNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.shopInfo.mobileMoneyNumber')}</FormLabel>
              <FormControl>
                <Input {...field} type="tel" placeholder={t('settings.shopInfo.mobileMoneyPlaceholder')} />
              </FormControl>
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
