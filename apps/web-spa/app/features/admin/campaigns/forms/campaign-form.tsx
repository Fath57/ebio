import { campaignsControllerReach } from '@boilerstone/openapi-generator/client/sdk.gen'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { Textarea } from '@boilerstone/ui/components/primitives/textarea'
import { useQuery } from '@tanstack/react-query'
import { Link as LinkIcon, Megaphone, Package, Store, Users } from 'lucide-react'
import { useState } from 'react'
import { AnnouncementImageField } from '../../announcements/components/announcement-image-field'
import { EntityPicker } from '../../common/components/entity-picker'
import { searchProducts, searchSuppliers } from '../../common/utils/target-search'
import { CampaignPreview } from '../components/campaign-preview'

export interface CampaignPayload {
  title: string
  body: string
  imageUrl: string | null
  app: 'client' | 'supplier' | 'courier'
  segment: 'ALL' | 'ACTIVE' | 'NEVER_ORDERED' | 'LAPSED' | 'WITH_CART'
  targetType: 'SUPPLIER' | 'PRODUCT' | 'URL' | 'NONE'
  targetId: string | null
  scheduledAt: string | null
}

const APPS = [
  { key: 'client', label: 'Acheteurs' },
  { key: 'supplier', label: 'Boutiques' },
  { key: 'courier', label: 'Livreurs' },
] as const

/** Each one explains itself: a segment nobody can state is a segment nobody trusts. */
const SEGMENTS = [
  { key: 'ALL', label: 'Tout le monde', hint: 'Toutes les personnes joignables sur cette app' },
  { key: 'ACTIVE', label: 'Actifs', hint: 'Ont commandé dans les 30 derniers jours' },
  { key: 'NEVER_ORDERED', label: 'Jamais commandé', hint: 'Compte créé, aucune commande' },
  { key: 'LAPSED', label: 'Endormis', hint: 'Ont commandé, plus rien depuis 60 jours' },
  { key: 'WITH_CART', label: 'Panier en cours', hint: 'Ont des articles en attente' },
] as const

const TARGETS = [
  { value: 'NONE', icon: Megaphone, label: 'Rien à ouvrir' },
  { value: 'SUPPLIER', icon: Store, label: 'Une boutique' },
  { value: 'PRODUCT', icon: Package, label: 'Un produit' },
  { value: 'URL', icon: LinkIcon, label: 'Un lien' },
] as const

function localNow(offsetMinutes = 0): string {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000)
  const pad = (v: number): string => String(v).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Writing a message that goes to every phone at once.
 *
 * The reach is shown while it is written and not after: "everyone" means
 * something different on a Tuesday than it did last month, and a number that
 * arrives afterwards is one nobody could have acted on.
 */
export function CampaignForm({ onSubmit, onCancel, isPending }: {
  onSubmit: (payload: CampaignPayload) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [app, setApp] = useState<CampaignPayload['app']>('client')
  const [segment, setSegment] = useState<CampaignPayload['segment']>('ALL')
  const [targetType, setTargetType] = useState<CampaignPayload['targetType']>('NONE')
  const [targetId, setTargetId] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [scheduled, setScheduled] = useState(false)
  const [scheduledAt, setScheduledAt] = useState(localNow(60))

  const { data: reach } = useQuery({
    queryKey: ['admin', 'campaigns', 'reach', app, segment],
    queryFn: async () => {
      const response = await campaignsControllerReach({ query: { app, segment } as never })
      if (response.error)
        throw new Error('Failed to load reach')
      return (response.data as unknown as { count: number }).count
    },
  })

  const targetReady = targetType === 'NONE'
    || (targetType === 'URL' ? /^https?:\/\/.+/.test(targetUrl) : targetId.length > 0)
  const ready = title.trim().length > 0 && body.trim().length > 0 && targetReady

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
      <div className="space-y-6">
        <div className="space-y-1">
          <Label htmlFor="campaign-title">Titre</Label>
          <Input
            id="campaign-title"
            maxLength={120}
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Ex. Huile d'arachide à -20 % cette semaine"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="campaign-body">Message</Label>
          <Textarea
            id="campaign-body"
            maxLength={500}
            rows={3}
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Ce que la personne lit sous le titre."
          />
        </div>

        <div className="space-y-1">
          <Label>Image (facultative)</Label>
          <AnnouncementImageField value={imageUrl} onChange={setImageUrl} />
        </div>

        <div className="space-y-2">
          <Label>Application</Label>
          <div className="flex gap-2">
            {APPS.map(item => (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={app === item.key ? 'default' : 'outline'}
                onClick={() => setApp(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>À qui</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {SEGMENTS.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSegment(item.key)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  segment === item.key ? 'border-primary bg-primary/5' : 'hover:bg-accent/40'
                }`}
              >
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-muted-foreground text-xs">{item.hint}</p>
              </button>
            ))}
          </div>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" />
            {reach === undefined
              ? 'Calcul du nombre de destinataires…'
              : reach === 0
                ? 'Personne ne correspond — rien ne partira.'
                : `${reach} téléphone${reach > 1 ? 's' : ''} ${reach > 1 ? 'recevront' : 'recevra'} ce message.`}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Au clic</Label>
          <div className="grid grid-cols-2 gap-3">
            {TARGETS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTargetType(value)
                  setTargetId('')
                  setTargetUrl('')
                }}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  targetType === value ? 'border-primary bg-primary/5' : 'hover:bg-accent/40'
                }`}
              >
                <Icon className={targetType === value ? 'text-primary h-5 w-5' : 'text-muted-foreground h-5 w-5'} />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {(targetType === 'SUPPLIER' || targetType === 'PRODUCT') && (
          <EntityPicker
            value={targetId}
            placeholder={targetType === 'SUPPLIER' ? 'Choisir une boutique' : 'Choisir un produit'}
            searchPlaceholder="Rechercher…"
            emptyLabel="Aucun résultat"
            onSearch={query => (targetType === 'SUPPLIER' ? searchSuppliers(query) : searchProducts(query))}
            onSelect={option => setTargetId(option.id)}
          />
        )}

        {targetType === 'URL' && (
          <Input
            type="url"
            placeholder="https://…"
            value={targetUrl}
            onChange={event => setTargetUrl(event.target.value)}
          />
        )}

        <div className="space-y-2">
          <Label>Quand</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={scheduled ? 'outline' : 'default'}
              onClick={() => setScheduled(false)}
            >
              À la demande
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scheduled ? 'default' : 'outline'}
              onClick={() => setScheduled(true)}
            >
              Programmée
            </Button>
            {scheduled && (
              <Input
                type="datetime-local"
                className="w-56"
                value={scheduledAt}
                onChange={event => setScheduledAt(event.target.value)}
              />
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            « À la demande » crée un brouillon : rien ne part tant que vous ne l'envoyez pas.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            disabled={isPending || !ready}
            onClick={() => onSubmit({
              title: title.trim(),
              body: body.trim(),
              imageUrl: imageUrl.trim() || null,
              app,
              segment,
              targetType,
              targetId: targetType === 'URL' ? targetUrl.trim() : (targetId || null),
              scheduledAt: scheduled ? new Date(scheduledAt).toISOString() : null,
            })}
          >
            {isPending ? 'Création…' : scheduled ? 'Programmer' : 'Créer le brouillon'}
          </Button>
          <Button variant="outline" onClick={onCancel}>Annuler</Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 lg:h-fit lg:w-80">
        <CampaignPreview title={title} body={body} imageUrl={imageUrl.trim() || null} />
      </div>
    </div>
  )
}
