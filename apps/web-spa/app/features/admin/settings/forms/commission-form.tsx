import type { Resolver } from 'react-hook-form'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@boilerstone/ui/components/primitives/table'
import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const commissionSchema = z.object({
  miseEnRelationRate: z.coerce.number().min(0).max(100),
  commandeRate: z.coerce.number().min(0).max(100),
  premiumRate: z.coerce.number().min(0).max(100),
})

export type CommissionFormData = z.infer<typeof commissionSchema>

interface CommissionFormProps {
  onSubmit: (data: CommissionFormData) => void
  isPending: boolean
  initialData?: Partial<CommissionFormData>
}

export const CommissionForm: React.FC<CommissionFormProps> = ({ onSubmit, isPending, initialData }) => {
  const { t } = useTranslation()
  const form = useForm<CommissionFormData>({
    resolver: zodResolver(commissionSchema) as Resolver<CommissionFormData>,
    defaultValues: {
      miseEnRelationRate: initialData?.miseEnRelationRate ?? 0,
      commandeRate: initialData?.commandeRate ?? 0,
      premiumRate: initialData?.premiumRate ?? 0,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.settings.commission.plan')}</TableHead>
              <TableHead>{t('admin.settings.commission.rate')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">
                {t('admin.settings.commission.miseEnRelation')}
              </TableCell>
              <TableCell>
                <FormField
                  control={form.control}
                  name="miseEnRelationRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">{t('admin.settings.commission.miseEnRelation')}</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input {...field} type="number" min="0" max="100" step="0.1" className="w-24" />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">
                {t('admin.settings.commission.commande')}
              </TableCell>
              <TableCell>
                <FormField
                  control={form.control}
                  name="commandeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">{t('admin.settings.commission.commande')}</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input {...field} type="number" min="0" max="100" step="0.1" className="w-24" />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">
                {t('admin.settings.commission.premium')}
              </TableCell>
              <TableCell>
                <FormField
                  control={form.control}
                  name="premiumRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">{t('admin.settings.commission.premium')}</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input {...field} type="number" min="0" max="100" step="0.1" className="w-24" />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="mt-4">
          <Button type="submit" disabled={isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
