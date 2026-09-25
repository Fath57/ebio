import {
  adminCartsControllerReminderSettings,
  adminCartsControllerSetReminderSettings,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

const KEY = ['admin', 'carts', 'reminder-settings']

interface ReminderSettings {
  heures: number
  relances: number
}

/**
 * When a forgotten basket draws a message, and how many times.
 *
 * Zero relances switches it off without removing anything: the baskets are
 * still kept and still counted, nobody is simply written to.
 */
export function CartReminderForm() {
  const queryClient = useQueryClient()
  const [hours, setHours] = useState('6')
  const [count, setCount] = useState('1')

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const response = await adminCartsControllerReminderSettings()
      if (response.error)
        throw new Error('Failed to load reminder settings')
      return response.data as unknown as ReminderSettings
    },
  })

  useEffect(() => {
    if (data) {
      setHours(String(data.heures))
      setCount(String(data.relances))
    }
  }, [data])

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const response = await adminCartsControllerSetReminderSettings({
        body: { heures: Number(hours), relances: Number(count) } as never,
      })
      if (response.error)
        throw new Error('Failed to save reminder settings')
      return response.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cart-reminder-hours">Un panier est abandonné après</Label>
          <div className="flex items-center gap-2">
            <Input
              id="cart-reminder-hours"
              type="number"
              min={1}
              max={168}
              value={hours}
              onChange={event => setHours(event.target.value)}
              className="w-24"
            />
            <span className="text-muted-foreground text-sm">heures sans mouvement</span>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="cart-reminder-count">Nombre de relances</Label>
          <div className="flex items-center gap-2">
            <Input
              id="cart-reminder-count"
              type="number"
              min={0}
              max={5}
              value={count}
              onChange={event => setCount(event.target.value)}
              className="w-24"
            />
            <span className="text-muted-foreground text-sm">0 = aucune relance</span>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        Le même délai sépare le dernier ajout de la première relance et chaque relance de
        la précédente. Un panier qui bouge repart de zéro.
      </p>

      <Button size="sm" disabled={isPending} onClick={() => save()}>
        {isPending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </div>
  )
}
