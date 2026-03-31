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
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PermissionsGrid } from '../components/permissions-grid'
import { fetchPermissionsQueryOptions } from '../utils/roles-queries'

const roleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissionIds: z.array(z.string()),
})

export type RoleFormData = z.infer<typeof roleSchema>

interface RoleFormProps {
  onSubmit: (data: RoleFormData) => void
  isPending: boolean
  initialData?: Partial<RoleFormData>
}

export const RoleForm: React.FC<RoleFormProps> = ({ onSubmit, isPending, initialData }) => {
  const { t } = useTranslation()
  const { data: permissionsData } = useQuery(fetchPermissionsQueryOptions())

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      permissionIds: initialData?.permissionIds ?? [],
    },
  })

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.roles.form.name')}</FormLabel>
              <FormControl>
                <Input {...field} placeholder={t('admin.roles.form.namePlaceholder')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.roles.form.description')}</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder={t('admin.roles.form.descriptionPlaceholder')} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="permissionIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.roles.form.permissions')}</FormLabel>
              <FormControl>
                <PermissionsGrid
                  permissions={permissionsData?.data ?? []}
                  selectedIds={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {initialData ? t('admin.roles.form.update') : t('admin.roles.form.create')}
        </Button>
      </form>
    </Form>
  )
}
