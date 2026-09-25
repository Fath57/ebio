import {
  adminAnnouncementsControllerApprove,
  adminAnnouncementsControllerGetInterval,
  adminAnnouncementsControllerList,
  adminAnnouncementsControllerListRequests,
  adminAnnouncementsControllerReject,
  adminAnnouncementsControllerSetActive,
  adminAnnouncementsControllerSetInterval,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Dialog, DialogContent } from '@boilerstone/ui/components/primitives/dialog'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

interface AnnouncementRequestRow {
  id: string
  title: string
  subtitle: string | null
  durationDays: number
  price: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  rejectionReason: string | null
  createdAt: string
  supplier?: { shopName?: string } | null
}

interface AnnouncementRow {
  id: string
  title: string
  subtitle: string | null
  origin: 'PLATFORM' | 'SUPPLIER'
  startsAt: string
  endsAt: string
  active: boolean
  supplier?: { shopName?: string } | null
}

const REQUESTS_KEY = ['admin', 'announcement-requests']
const LIVE_KEY = ['admin', 'announcements']
const INTERVAL_KEY = ['admin', 'announcement-interval']

function money(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function day(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Les annonces affichées à l'ouverture de l'application cliente.
 *
 * Deux choses au même endroit, parce qu'elles se décident ensemble : les
 * demandes payées par les boutiques, qui attendent un avis, et ce qui est en
 * cours de diffusion. Refuser rembourse — c'est le circuit des bannières, et
 * la boutique n'a rien à réclamer.
 */
export function AnnouncementsManager() {
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState<AnnouncementRequestRow | null>(null)
  const [reason, setReason] = useState('')

  const { data: requests = [], isLoading: loadingRequests } = useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: async () => {
      const response = await adminAnnouncementsControllerListRequests({ query: { status: 'PENDING' } as never })
      if (response.error)
        throw new Error('Failed to load announcement requests')
      return (response.data as { requests: AnnouncementRequestRow[] }).requests
    },
  })

  const { data: live = [], isLoading: loadingLive } = useQuery({
    queryKey: LIVE_KEY,
    queryFn: async () => {
      const response = await adminAnnouncementsControllerList()
      if (response.error)
        throw new Error('Failed to load announcements')
      return (response.data as { announcements: AnnouncementRow[] }).announcements
    },
  })

  const { data: interval } = useQuery({
    queryKey: INTERVAL_KEY,
    queryFn: async () => {
      const response = await adminAnnouncementsControllerGetInterval()
      if (response.error)
        throw new Error('Failed to load interval')
      return (response.data as { intervalleHeures: number }).intervalleHeures
    },
  })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: REQUESTS_KEY })
    void queryClient.invalidateQueries({ queryKey: LIVE_KEY })
  }

  const { mutate: approve, isPending: isApproving } = useMutation({
    mutationFn: async (id: string) => {
      const response = await adminAnnouncementsControllerApprove({ path: { id }, body: {} as never })
      if (response.error)
        throw new Error('Failed to approve')
      return response.data
    },
    onSuccess: refresh,
  })

  const { mutate: reject } = useMutation({
    mutationFn: async ({ id, why }: { id: string, why: string }) => {
      const response = await adminAnnouncementsControllerReject({ path: { id }, body: { reason: why } as never })
      if (response.error)
        throw new Error('Failed to reject')
      return response.data
    },
    onSuccess: () => {
      setRejecting(null)
      setReason('')
      refresh()
    },
  })

  const { mutate: setActive } = useMutation({
    mutationFn: async ({ id, active }: { id: string, active: boolean }) => {
      const response = await adminAnnouncementsControllerSetActive({ path: { id }, body: { active } as never })
      if (response.error)
        throw new Error('Failed to toggle')
      return response.data
    },
    onSuccess: refresh,
  })

  const { mutate: saveInterval, isPending: isSavingInterval } = useMutation({
    mutationFn: async (hours: number) => {
      const response = await adminAnnouncementsControllerSetInterval({ body: { intervalleHeures: hours } as never })
      if (response.error)
        throw new Error('Failed to save interval')
      return response.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INTERVAL_KEY })
    },
  })

  if (loadingRequests || loadingLive) {
    return <Skeleton className="h-64 w-full" />
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="font-medium">Demandes en attente</h3>
          <p className="text-muted-foreground text-sm">
            Déjà payées : refuser rembourse la boutique.
          </p>
        </div>

        {requests.length === 0
          ? <p className="text-muted-foreground text-sm">Aucune demande en attente.</p>
          : (
              <ul className="divide-y rounded-md border">
                {requests.map(request => (
                  <li key={request.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{request.title}</p>
                      <p className="text-muted-foreground text-sm">
                        {request.supplier?.shopName ?? 'Boutique inconnue'}
                        {' · '}
                        {request.durationDays}
                        {' jour(s) · '}
                        {money(request.price)}
                      </p>
                      {request.subtitle && (
                        <p className="text-muted-foreground truncate text-sm">{request.subtitle}</p>
                      )}
                    </div>
                    <Button size="sm" disabled={isApproving} onClick={() => approve(request.id)}>
                      Approuver
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(request)}>
                      Refuser
                    </Button>
                  </li>
                ))}
              </ul>
            )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-medium">Annonces</h3>
          <p className="text-muted-foreground text-sm">
            Une seule s'affiche par ouverture : la plus prioritaire que l'acheteur n'a pas vue récemment.
          </p>
        </div>

        {live.length === 0
          ? <p className="text-muted-foreground text-sm">Aucune annonce.</p>
          : (
              <ul className="divide-y rounded-md border">
                {live.map(announcement => (
                  <li key={announcement.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{announcement.title}</span>
                        <Badge variant="outline">
                          {announcement.origin === 'PLATFORM' ? 'eBio' : announcement.supplier?.shopName ?? 'Boutique'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {`Du ${day(announcement.startsAt)} au ${day(announcement.endsAt)}`}
                      </p>
                    </div>
                    <Switch
                      checked={announcement.active}
                      aria-label={announcement.active ? `Éteindre ${announcement.title}` : `Allumer ${announcement.title}`}
                      onCheckedChange={active => setActive({ id: announcement.id, active })}
                    />
                  </li>
                ))}
              </ul>
            )}
      </section>

      <section className="space-y-2">
        <Label htmlFor="announcement-interval">Une même annonce revient au plus tous les</Label>
        <div className="flex items-center gap-2">
          <Input
            id="announcement-interval"
            type="number"
            min={1}
            max={720}
            className="w-32"
            defaultValue={interval ?? 24}
            onBlur={(event) => {
              const hours = Number(event.target.value)
              if (Number.isInteger(hours) && hours !== interval) {
                saveInterval(hours)
              }
            }}
          />
          <span className="text-muted-foreground text-sm">heures</span>
          {isSavingInterval && <span className="text-muted-foreground text-sm">Enregistrement…</span>}
        </div>
        <p className="text-muted-foreground text-sm">
          Une annonce qui revient à chaque ouverture cesse d'être lue au bout de deux fois.
        </p>
      </section>

      <Dialog open={rejecting !== null} onOpenChange={open => !open && setRejecting(null)}>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{`Refuser « ${rejecting?.title ?? ''} » ?`}</h3>
              <p className="text-muted-foreground text-sm">
                {`${money(rejecting?.price ?? 0)} seront recrédités au portefeuille de la boutique. La raison lui est transmise.`}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Raison</Label>
              <Input
                id="reject-reason"
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder="Visuel illisible, message hors sujet…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejecting(null)}>Annuler</Button>
              <Button
                variant="destructive"
                disabled={reason.trim().length === 0}
                onClick={() => rejecting && reject({ id: rejecting.id, why: reason.trim() })}
              >
                Refuser et rembourser
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
