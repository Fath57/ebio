import { client } from '@boilerstone/openapi-generator'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Dialog,
  DialogContent,
} from '@boilerstone/ui/components/primitives/dialog'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 3

interface SalesPoint {
  id: string
  name: string
  address: string | null
  phone: string | null
  latitude: number | null
  longitude: number | null
  isActive: boolean
}

interface Suggestion {
  placeId: string
  label: string
  context: string
}

function createSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The supplier's other selling places, managed from the web the same way as
 * from the app. Per-point opening hours are edited in the app for now; the
 * web form covers identity, contact and position.
 */
export function SalesPointsManager() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<SalesPoint | 'new' | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['supplier', 'sales-points'],
    queryFn: async () => {
      const response = await client.get({ url: '/api/suppliers/me/sales-points' })
      if (response.error)
        throw new Error('Failed to fetch sales points')
      return response.data as { items: SalesPoint[], total: number }
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['supplier', 'sales-points'] })

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: string, isActive: boolean }) => {
      const response = await client.patch({
        url: `/api/suppliers/me/sales-points/${id}`,
        body: { isActive },
      })
      if (response.error)
        throw new Error('Failed to update sales point')
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const response = await client.delete({ url: `/api/suppliers/me/sales-points/${id}` })
      if (response.error)
        throw new Error('Failed to delete sales point')
    },
    onSuccess: invalidate,
  })

  const points = data?.items ?? []

  return (
    <div className="space-y-4">
      {isLoading && <p className="text-muted-foreground text-sm">…</p>}

      {!isLoading && points.length === 0 && (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {t('settings.salesPoints.empty')}
        </p>
      )}

      {points.map(point => (
        <div key={point.id} className="flex items-center gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{point.name}</p>
              {point.latitude === null && (
                <Badge variant="outline">{t('settings.salesPoints.noPosition')}</Badge>
              )}
            </div>
            <p className="text-muted-foreground truncate text-sm">{point.address ?? '—'}</p>
          </div>
          <Switch
            checked={point.isActive}
            disabled={toggle.isPending}
            onCheckedChange={isActive => toggle.mutate({ id: point.id, isActive })}
            aria-label={t('settings.salesPoints.visible')}
          />
          <Button variant="ghost" size="sm" onClick={() => setEditing(point)} aria-label={t('common.edit')}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={remove.isPending}
            onClick={() => remove.mutate(point.id)}
            aria-label={t('common.delete')}
          >
            <Trash2 className="text-destructive h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button variant="outline" onClick={() => setEditing('new')}>
        <Plus className="mr-2 h-4 w-4" />
        {t('settings.salesPoints.add')}
      </Button>

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          {editing && (
            <SalesPointForm
              point={editing === 'new' ? null : editing}
              onDone={(saved) => {
                setEditing(null)
                if (saved) {
                  invalidate()
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface SalesPointFormProps {
  point: SalesPoint | null
  onDone: (saved: boolean) => void
}

function SalesPointForm({ point, onDone }: SalesPointFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(point?.name ?? '')
  const [address, setAddress] = useState(point?.address ?? '')
  const [phone, setPhone] = useState(point?.phone ?? '')
  const [latitude, setLatitude] = useState<number | null>(point?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(point?.longitude ?? null)
  const [error, setError] = useState<string | null>(null)

  // Address search, same billing-conscious pattern as the shop location form.
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  const sessionToken = useRef(createSessionToken())

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const response = await client.get({
          url: '/api/geocoding/autocomplete',
          query: { q: trimmed, kind: 'address', session: sessionToken.current },
        })
        if (!cancelled)
          setSuggestions(((response.data as { suggestions?: Suggestion[] })?.suggestions ?? []))
      }
      finally {
        if (!cancelled)
          setSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  async function pickSuggestion(suggestion: Suggestion): Promise<void> {
    setSuggestions([])
    setQuery('')
    if (!address) {
      setAddress(suggestion.label)
    }
    const response = await client.get({
      url: '/api/geocoding/place',
      query: { placeId: suggestion.placeId, session: sessionToken.current },
    })
    const coords = response.data as { latitude?: number, longitude?: number } | undefined
    if (coords?.latitude !== undefined && coords.longitude !== undefined) {
      setLatitude(coords.latitude)
      setLongitude(coords.longitude)
    }
    sessionToken.current = createSessionToken()
  }

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: name.trim(),
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      }
      if (latitude !== null && longitude !== null) {
        body.latitude = latitude
        body.longitude = longitude
      }
      const response = point
        ? await client.patch({ url: `/api/suppliers/me/sales-points/${point.id}`, body })
        : await client.post({ url: '/api/suppliers/me/sales-points', body })
      if (response.error)
        throw new Error('save failed')
    },
    onSuccess: () => onDone(true),
    onError: () => setError(t('settings.salesPoints.saveError')),
  })

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {point ? t('settings.salesPoints.edit') : t('settings.salesPoints.add')}
      </h3>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">{t('settings.salesPoints.name')}</span>
        <Input value={name} maxLength={100} placeholder={t('settings.salesPoints.namePlaceholder')} onChange={e => setName(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">{t('settings.salesPoints.address')}</span>
        <Input value={address} maxLength={255} onChange={e => setAddress(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">{t('settings.salesPoints.phone')}</span>
        <Input value={phone} maxLength={20} onChange={e => setPhone(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">{t('settings.salesPoints.searchPosition')}</span>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          {searching && <Loader2 className="text-muted-foreground absolute top-2.5 right-3 h-4 w-4 animate-spin" />}
          <Input
            value={query}
            placeholder={t('settings.salesPoints.searchPlaceholder')}
            className="px-9"
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        {suggestions.length > 0 && (
          <div className="rounded-lg border shadow-sm">
            {suggestions.map(suggestion => (
              <button
                key={suggestion.placeId}
                type="button"
                onClick={() => pickSuggestion(suggestion)}
                className="hover:bg-accent flex w-full items-start gap-2 px-3 py-2 text-left"
              >
                <MapPin className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-sm">
                  <span className="font-medium">{suggestion.label}</span>
                  {suggestion.context && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {suggestion.context}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          {latitude !== null && longitude !== null
            ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
            : t('settings.salesPoints.noPositionYet')}
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onDone(false)}>{t('common.cancel')}</Button>
        <Button disabled={save.isPending || name.trim().length < 2} onClick={() => save.mutate()}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  )
}
