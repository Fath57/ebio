import type { CampaignPayload } from '../forms/campaign-form'
import {
  campaignsControllerCancel,
  campaignsControllerCreate,
  campaignsControllerList,
  campaignsControllerSend,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Dialog, DialogContent } from '@boilerstone/ui/components/primitives/dialog'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ProductThumb } from '../../common/components/product-thumb'
import { CampaignForm } from '../forms/campaign-form'

interface CampaignRow {
  id: string
  title: string
  body: string
  imageUrl: string | null
  app: string
  segment: string
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED'
  scheduledAt: string | null
  sentAt: string | null
  recipients: number
  sent: number
  failed: number
}

const KEY = ['admin', 'campaigns']

const STATUS: Record<CampaignRow['status'], { label: string, variant: 'default' | 'outline' | 'destructive' }> = {
  DRAFT: { label: 'Brouillon', variant: 'outline' },
  SCHEDULED: { label: 'Programmée', variant: 'default' },
  SENDING: { label: 'En cours', variant: 'default' },
  SENT: { label: 'Envoyée', variant: 'outline' },
  CANCELLED: { label: 'Annulée', variant: 'destructive' },
}

const APPS: Record<string, string> = {
  client: 'Acheteurs',
  supplier: 'Boutiques',
  courier: 'Livreurs',
}

const SEGMENTS: Record<string, string> = {
  ALL: 'tout le monde',
  ACTIVE: 'actifs',
  NEVER_ORDERED: 'jamais commandé',
  LAPSED: 'endormis',
  WITH_CART: 'panier en cours',
}

function moment(value: string): string {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Notifications written on purpose, as opposed to the ones an order causes.
 *
 * Nothing goes out by creating it: a campaign is a draft until someone sends
 * it, because a notification cannot be taken back and the only safeguard
 * worth having is a second, deliberate act.
 */
export default function AdminCampaignsPage() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState<CampaignRow | null>(null)

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const response = await campaignsControllerList()
      if (response.error)
        throw new Error('Failed to load campaigns')
      return (response.data as unknown as { campaigns: CampaignRow[] }).campaigns
    },
  })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: KEY })
  }

  const { mutate: create, isPending: isCreating } = useMutation({
    mutationFn: async (payload: CampaignPayload) => {
      const response = await campaignsControllerCreate({ body: payload as never })
      if (response.error)
        throw new Error('Failed to create campaign')
      return response.data
    },
    onSuccess: () => {
      setCreating(false)
      refresh()
    },
  })

  const { mutate: send, isPending: isSending } = useMutation({
    mutationFn: async (id: string) => {
      const response = await campaignsControllerSend({ path: { id } })
      if (response.error)
        throw new Error('Failed to send campaign')
      return response.data
    },
    onSuccess: () => {
      setSending(null)
      refresh()
    },
  })

  const { mutate: cancel } = useMutation({
    mutationFn: async (id: string) => {
      const response = await campaignsControllerCancel({ path: { id } })
      if (response.error)
        throw new Error('Failed to cancel campaign')
      return response.data
    },
    onSuccess: refresh,
  })

  if (creating) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Nouvelle campagne</h1>
        <CampaignForm
          isPending={isCreating}
          onCancel={() => setCreating(false)}
          onSubmit={payload => create(payload)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Campagnes</h1>
          <p className="text-muted-foreground">
            Les notifications qu'on écrit, par opposition à celles qu'une commande provoque.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle campagne
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading
            ? <Skeleton className="h-40 w-full" />
            : campaigns.length === 0
              ? <p className="text-muted-foreground text-sm">Aucune campagne pour l'instant.</p>
              : (
                  <ul className="divide-y">
                    {campaigns.map(campaign => (
                      <li key={campaign.id} className="flex items-start gap-3 py-3">
                        <ProductThumb url={campaign.imageUrl} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{campaign.title}</span>
                            <Badge variant={STATUS[campaign.status].variant}>
                              {STATUS[campaign.status].label}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground truncate text-sm">{campaign.body}</p>
                          <p className="text-muted-foreground text-xs">
                            {APPS[campaign.app] ?? campaign.app}
                            {' · '}
                            {SEGMENTS[campaign.segment] ?? campaign.segment}
                            {campaign.status === 'SENT' && ` · ${campaign.sent}/${campaign.recipients} remis`}
                            {campaign.status === 'SCHEDULED' && campaign.scheduledAt && ` · le ${moment(campaign.scheduledAt)}`}
                            {campaign.sentAt && ` · ${moment(campaign.sentAt)}`}
                          </p>
                        </div>
                        {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                          <div className="flex shrink-0 gap-2">
                            <Button size="sm" onClick={() => setSending(campaign)}>Envoyer</Button>
                            <Button size="sm" variant="outline" onClick={() => cancel(campaign.id)}>
                              Annuler
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
        </CardContent>
      </Card>

      {/* A notification cannot be recalled: the confirmation says how many
          phones, because that is the number worth hesitating over. */}
      <Dialog open={sending !== null} onOpenChange={open => !open && setSending(null)}>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                {`Envoyer « ${sending?.title ?? ''} » ?`}
              </h3>
              <p className="text-muted-foreground text-sm">
                Le message part immédiatement à
                {' '}
                {APPS[sending?.app ?? ''] ?? 'cette application'}
                {' — '}
                {SEGMENTS[sending?.segment ?? ''] ?? 'segment'}
                . Une notification ne se rappelle pas.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSending(null)}>Annuler</Button>
              <Button
                disabled={isSending}
                onClick={() => sending && send(sending.id)}
              >
                {isSending ? 'Envoi…' : 'Envoyer maintenant'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
