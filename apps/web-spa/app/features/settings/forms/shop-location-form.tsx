import type { Resolver } from 'react-hook-form'
import { client } from '@boilerstone/openapi-generator'
import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { zodResolver } from '@hookform/resolvers/zod'
import { ExternalLink, Loader2, MapPin, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

/** Leaves time to finish a word before querying — and before being billed. */
const DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 3

const shopLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
})

export type ShopLocationFormData = z.infer<typeof shopLocationSchema>

interface Suggestion {
  placeId: string
  label: string
  context: string
}

interface ShopLocationFormProps {
  onSubmit: (data: ShopLocationFormData) => void
  isPending: boolean
  initialData?: { latitude: number | null, longitude: number | null }
}

function createSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function ShopLocationForm({ onSubmit, isPending, initialData }: ShopLocationFormProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  // Groups the keystrokes of one search and its final resolution into a single
  // billed session, and is renewed once a place has been picked.
  const sessionToken = useRef(createSessionToken())

  const form = useForm<ShopLocationFormData>({
    // `z.coerce` makes the schema's input and output types differ, which
    // widens the resolver's generics. Same cast as the banner form.
    resolver: zodResolver(shopLocationSchema) as Resolver<ShopLocationFormData>,
    defaultValues: { latitude: 0, longitude: 0 },
  })

  useEffect(() => {
    if (initialData?.latitude != null && initialData?.longitude != null) {
      form.reset({ latitude: initialData.latitude, longitude: initialData.longitude })
    }
  }, [initialData, form])

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
        const result = await client.get({
          url: '/api/geocoding/autocomplete',
          // `address` keeps streets and businesses: a shop pins its own door,
          // it does not pick a town.
          query: { q: trimmed, kind: 'address', session: sessionToken.current },
        })
        if (!cancelled) {
          setSuggestions(((result.data as { suggestions?: Suggestion[] })?.suggestions ?? []))
        }
      }
      catch {
        if (!cancelled) {
          setSuggestions([])
        }
      }
      finally {
        if (!cancelled) {
          setSearching(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  async function handlePick(suggestion: Suggestion) {
    setSuggestions([])
    setQuery(suggestion.label)
    try {
      const result = await client.get({
        url: '/api/geocoding/place',
        query: { placeId: suggestion.placeId, session: sessionToken.current },
      })
      const place = result.data as { latitude?: number, longitude?: number } | undefined
      if (typeof place?.latitude === 'number' && typeof place?.longitude === 'number') {
        form.setValue('latitude', place.latitude, { shouldDirty: true })
        form.setValue('longitude', place.longitude, { shouldDirty: true })
      }
    }
    finally {
      // The session ends with the resolution: the next one starts fresh.
      sessionToken.current = createSessionToken()
    }
  }

  const latitude = form.watch('latitude')
  const longitude = form.watch('longitude')
  const hasPosition = Number(latitude) !== 0 || Number(longitude) !== 0

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="relative">
          <label className="text-sm font-medium" htmlFor="shop-location-search">
            {t('settings.location.search')}
          </label>
          <div className="relative mt-2">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="shop-location-search"
              className="pl-9"
              value={query}
              autoComplete="off"
              placeholder={t('settings.location.searchPlaceholder')}
              onChange={event => setQuery(event.target.value)}
            />
            {searching && (
              <Loader2 className="text-muted-foreground absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin" />
            )}
          </div>

          {suggestions.length > 0 && (
            <ul className="bg-popover absolute z-10 mt-1 w-full overflow-hidden rounded-md border shadow-md">
              {suggestions.map(suggestion => (
                <li key={suggestion.placeId}>
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full items-start gap-2 px-3 py-2 text-left"
                    onClick={() => handlePick(suggestion)}
                  >
                    <MapPin className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{suggestion.label}</span>
                      {suggestion.context
                        ? <span className="text-muted-foreground block truncate text-xs">{suggestion.context}</span>
                        : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-2 text-xs">{t('settings.location.searchHint')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="latitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.location.latitude')}</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="longitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.location.longitude')}</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormDescription>
          {hasPosition
            ? (
                <a
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                  href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('settings.location.preview')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )
            : t('settings.location.noPosition')}
        </FormDescription>

        <Button type="submit" disabled={isPending}>
          {isPending ? t('common.saving') : t('common.save')}
        </Button>
      </form>
    </Form>
  )
}
