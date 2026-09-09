import { Alert, AlertDescription } from '@boilerstone/ui/components/primitives/alert'
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
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PermissionsGrid } from '../components/permissions-grid'
import { fetchPermissionCatalogQueryOptions } from '../utils/roles-queries'

const roleSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  permissionIds: z.array(z.string()),
})

export type RoleFormData = z.infer<typeof roleSchema>

interface RoleFormProps {
  onSubmit: (data: RoleFormData) => void
  isPending: boolean
  initialData?: Partial<RoleFormData>
  /** System role: shown for reference, nothing can be changed. */
  readOnly?: boolean
}

export function RoleForm({ onSubmit, isPending, initialData, readOnly = false }: RoleFormProps) {
  const { t } = useTranslation()
  const { data: catalog, isLoading: isCatalogLoading } = useQuery(fetchPermissionCatalogQueryOptions())

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
        {readOnly && (
          <Alert>
            <ShieldCheck />
            <AlertDescription>{t('admin.roles.systemNotice')}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('admin.roles.form.name')}</FormLabel>
              <FormControl>
                <Input {...field} disabled={readOnly} placeholder={t('admin.roles.form.namePlaceholder')} />
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
                <Textarea {...field} disabled={readOnly} placeholder={t('admin.roles.form.descriptionPlaceholder')} rows={3} />
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
              {readOnly && (
                <p className="text-sm text-muted-foreground">{t('admin.roles.allRights')}</p>
              )}
              <FormControl>
                {isCatalogLoading
                  ? <Skeleton className="h-48 w-full" />
                  : (
                      <PermissionsGrid
                        sections={catalog?.sections ?? []}
                        selectedIds={field.value}
                        onChange={field.onChange}
                        readOnly={readOnly}
                      />
                    )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!readOnly && (
          <Button type="submit" className="w-full" disabled={isPending}>
            {initialData ? t('admin.roles.form.update') : t('admin.roles.form.create')}
          </Button>
        )}
      </form>
    </Form>
  )
}
