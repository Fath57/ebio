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

const profileSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  phone: z.union([z.string().min(4), z.literal('')]).optional(),
})

export type ProfileFormData = z.infer<typeof profileSchema>

interface ProfileFormProps {
  onSubmit: (data: ProfileFormData) => void
  isPending: boolean
  initialData?: Partial<ProfileFormData>
}

export function ProfileForm({ onSubmit, isPending, initialData }: ProfileFormProps) {
  const { t } = useTranslation()
  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
    },
  })

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name ?? '',
        email: initialData.email ?? '',
        phone: initialData.phone ?? '',
      })
    }
  }, [initialData, form])

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('profile.form.name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('profile.form.namePlaceholder')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('profile.form.email')}</FormLabel>
              <FormControl>
                <Input {...field} type="email" placeholder={t('profile.form.emailPlaceholder')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('profile.form.phone')}</FormLabel>
              <FormControl>
                <Input {...field} type="tel" placeholder={t('profile.form.phonePlaceholder')} />
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
