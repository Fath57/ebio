import {
  adminAppVersionControllerRead,
  adminAppVersionControllerWrite,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

type Variant = 'client' | 'supplier' | 'courier'

interface Rule { minimum: string, latest: string }
type Versions = Record<Variant, Rule>

const KEY = ['admin', 'app-version']

const APPS: Array<{ key: Variant, label: string }> = [
  { key: 'client', label: 'Application Client' },
  { key: 'supplier', label: 'Application Fournisseur' },
  { key: 'courier', label: 'Application Livreur' },
]

const EMPTY: Versions = {
  client: { minimum: '1.0.0', latest: '1.0.0' },
  supplier: { minimum: '1.0.0', latest: '1.0.0' },
  courier: { minimum: '1.0.0', latest: '1.0.0' },
}

const SHAPE = /^\d+\.\d+\.\d+$/

/**
 * What each app is told to be on.
 *
 * Two numbers, and the difference matters. The latest one is offered — a band
 * that can be dismissed. The minimum blocks the app outright, so it is raised
 * only for a release that must not be skipped: an API that stopped accepting
 * what older builds send, a payment flow that changed.
 */
export function AppVersionForm() {
  const queryClient = useQueryClient()
  const [versions, setVersions] = useState<Versions>(EMPTY)

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const response = await adminAppVersionControllerRead()
      if (response.error)
        throw new Error('Failed to load app versions')
      return response.data as unknown as Versions
    },
  })

  useEffect(() => {
    if (data) {
      setVersions(data)
    }
  }, [data])

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const response = await adminAppVersionControllerWrite({ body: versions as never })
      if (response.error)
        throw new Error('Failed to save app versions')
      return response.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
  })

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />
  }

  const malformed = APPS.some(app =>
    !SHAPE.test(versions[app.key].minimum) || !SHAPE.test(versions[app.key].latest),
  )

  const set = (app: Variant, field: keyof Rule, value: string): void => {
    setVersions(current => ({ ...current, [app]: { ...current[app], [field]: value } }))
  }

  return (
    <div className="space-y-6">
      {APPS.map(app => (
        <div key={app.key} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <p className="font-medium">{app.label}</p>

          <div className="space-y-1">
            <Label htmlFor={`${app.key}-latest`}>Dernière version</Label>
            <Input
              id={`${app.key}-latest`}
              className="w-32"
              value={versions[app.key].latest}
              onChange={event => set(app.key, 'latest', event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${app.key}-minimum`}>Version minimale</Label>
            <Input
              id={`${app.key}-minimum`}
              className="w-32"
              value={versions[app.key].minimum}
              onChange={event => set(app.key, 'minimum', event.target.value)}
            />
          </div>
        </div>
      ))}

      <p className="text-muted-foreground text-sm">
        La dernière version est
        {' '}
        <strong>proposée</strong>
        {' '}
        : un bandeau que l'utilisateur peut
        écarter. La version minimale
        {' '}
        <strong>bloque</strong>
        {' '}
        l'application tant qu'elle n'est pas
        installée — à ne relever que pour une version qu'on ne peut pas sauter.
      </p>

      <Button size="sm" disabled={isPending || malformed} onClick={() => save()}>
        {isPending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
      {malformed && (
        <p className="text-destructive text-sm">Format attendu : 1.2.3</p>
      )}
    </div>
  )
}
