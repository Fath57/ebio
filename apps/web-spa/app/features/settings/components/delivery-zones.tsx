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
import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const zoneSchema = z.object({
  deliveryFee: z.coerce.number().min(0),
  estimatedMinutes: z.coerce.number().int().min(0),
})

type ZoneFormData = z.infer<typeof zoneSchema>

export interface DeliveryZoneItem {
  id: string
  deliveryFee: number
  estimatedMinutes: number
}

interface DeliveryZonesProps {
  zones: DeliveryZoneItem[]
  onAdd: (data: { deliveryFee: number, estimatedMinutes: number, polygon: Array<{ latitude: number, longitude: number }> }) => void
  onDelete: (id: string) => void
  isPending: boolean
}

export function DeliveryZones({ zones, onAdd, onDelete, isPending }: DeliveryZonesProps) {
  const { t } = useTranslation()
  const form = useForm<ZoneFormData>({
    resolver: zodResolver(zoneSchema) as Resolver<ZoneFormData>,
    defaultValues: {
      deliveryFee: 0,
      estimatedMinutes: 30,
    },
  })

  const handleAdd = (data: ZoneFormData) => {
    onAdd({
      deliveryFee: data.deliveryFee,
      estimatedMinutes: data.estimatedMinutes,
      polygon: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 0.01 },
        { latitude: 0.01, longitude: 0 },
      ],
    })
    form.reset()
  }

  return (
    <div className="space-y-4">
      {zones.length > 0
        ? (
            <div className="space-y-2">
              {zones.map(zone => (
                <div key={zone.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {zone.deliveryFee}
                      {' '}
                      {t('settings.deliveryZones.currency')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ~
                      {zone.estimatedMinutes}
                      {' '}
                      {t('settings.deliveryZones.minutes')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(zone.id)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )
        : (
            <p className="text-sm text-muted-foreground">{t('settings.deliveryZones.noZones')}</p>
          )}

      <Form {...form}>
        <form className="flex items-end gap-3" onSubmit={form.handleSubmit(handleAdd)}>
          <FormField
            control={form.control}
            name="deliveryFee"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('settings.deliveryZones.fee')}</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" step="100" placeholder={t('settings.deliveryZones.currency')} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estimatedMinutes"
            render={({ field }) => (
              <FormItem className="w-32">
                <FormLabel>{t('settings.deliveryZones.estimatedMinutes')}</FormLabel>
                <FormControl>
                  <Input {...field} type="number" min="0" placeholder="min" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isPending}>
            {t('settings.deliveryZones.add')}
          </Button>
        </form>
      </Form>
    </div>
  )
}
