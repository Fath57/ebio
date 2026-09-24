import type { Resolver } from 'react-hook-form'
import { searchControllerSearchProducts } from '@boilerstone/openapi-generator/client/sdk.gen'
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
import { Label } from '@boilerstone/ui/components/primitives/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { Switch } from '@boilerstone/ui/components/primitives/switch'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

/** Ce que l'application sait dessiner. Un nom libre laisserait un trou. */
const ICONS = ['map-pin', 'badge-check', 'tag', 'sparkles', 'star', 'leaf', 'flame', 'clock'] as const

const formSchema = z.object({
  title: z.string().trim().min(1, 'Un titre est nécessaire').max(120),
  subtitle: z.string().trim().max(200).optional(),
  icon: z.string().optional(),
  mode: z.enum(['CRITERIA', 'MANUAL']),
  limit: z.coerce.number().int().min(1).max(30),
  categorySlug: z.string().optional(),
  validatedOnly: z.boolean().optional(),
  promoOnly: z.boolean().optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  maxPrice: z.coerce.number().positive().optional(),
  newerThanDays: z.coerce.number().int().min(1).max(365).optional(),
  maxDistanceKm: z.coerce.number().positive().max(500).optional(),
  sortBy: z.enum(['distance', 'rating', 'price']).optional(),
})

export type HomeSectionFormData = z.infer<typeof formSchema>

export interface HomeSectionPayload {
  title: string
  subtitle: string | null
  icon: string | null
  mode: 'CRITERIA' | 'MANUAL'
  limit: number
  criteria: Record<string, unknown> | null
  productIds: string[] | null
}

interface PickedProduct {
  id: string
  name: string
  shopName: string
}

interface HomeSectionFormProps {
  initial?: HomeSectionPayload & { productNames?: PickedProduct[] }
  onSubmit: (payload: HomeSectionPayload) => void
  onCancel: () => void
  isPending: boolean
}

/** Rien de coché n'est pas un critère : `undefined` plutôt que `false`. */
function compact(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) =>
      value !== undefined && value !== '' && value !== false && !Number.isNaN(value)),
  )
}

/**
 * Créer ou modifier une section de l'accueil.
 *
 * Deux façons de la remplir, exclusives : des critères — une recherche
 * enregistrée — ou une liste de produits choisis un par un. Le formulaire
 * n'affiche que celle qui est retenue, parce que voir les deux laisse croire
 * qu'elles se combinent.
 */
export function HomeSectionForm({ initial, onSubmit, onCancel, isPending }: HomeSectionFormProps) {
  const criteria = (initial?.criteria ?? {}) as Record<string, unknown>
  const form = useForm<HomeSectionFormData>({
    resolver: zodResolver(formSchema) as Resolver<HomeSectionFormData>,
    defaultValues: {
      title: initial?.title ?? '',
      subtitle: initial?.subtitle ?? '',
      icon: initial?.icon ?? 'sparkles',
      mode: initial?.mode ?? 'CRITERIA',
      limit: initial?.limit ?? 10,
      categorySlug: (criteria.categorySlug as string | undefined) ?? '',
      validatedOnly: criteria.validatedOnly === true,
      promoOnly: criteria.promoOnly === true,
      minRating: criteria.minRating as number | undefined,
      maxPrice: criteria.maxPrice as number | undefined,
      newerThanDays: criteria.newerThanDays as number | undefined,
      maxDistanceKm: criteria.maxDistanceKm as number | undefined,
      sortBy: (criteria.sortBy as HomeSectionFormData['sortBy']) ?? 'distance',
    },
  })

  const mode = form.watch('mode')
  const [picked, setPicked] = useState<PickedProduct[]>(initial?.productNames ?? [])
  const [term, setTerm] = useState('')

  const { data: found = [] } = useQuery({
    queryKey: ['admin', 'home-sections', 'product-search', term],
    enabled: mode === 'MANUAL' && term.trim().length >= 2,
    queryFn: async () => {
      const response = await searchControllerSearchProducts({
        query: { q: term, limit: 8, inStockOnly: 'false' } as never,
      })
      if (response.error)
        return [] as PickedProduct[]
      const data = response.data as { results?: Array<{ product: { id: string, name: string }, supplier: { shopName: string } }> }
      return (data.results ?? []).map(result => ({
        id: result.product.id,
        name: result.product.name,
        shopName: result.supplier.shopName,
      }))
    },
  })

  const handleSubmit = (values: HomeSectionFormData): void => {
    onSubmit({
      title: values.title,
      subtitle: values.subtitle?.trim() ? values.subtitle.trim() : null,
      icon: values.icon ?? null,
      mode: values.mode,
      limit: values.limit,
      criteria: values.mode === 'CRITERIA'
        ? compact({
            categorySlug: values.categorySlug,
            validatedOnly: values.validatedOnly,
            promoOnly: values.promoOnly,
            minRating: values.minRating,
            maxPrice: values.maxPrice,
            newerThanDays: values.newerThanDays,
            maxDistanceKm: values.maxDistanceKm,
            sortBy: values.sortBy,
          })
        : null,
      productIds: values.mode === 'MANUAL' ? picked.map(product => product.id) : null,
    })
  }

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Titre</FormLabel>
                <FormControl>
                  <Input placeholder="Près de vous" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="icon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pictogramme</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ICONS.map(icon => <SelectItem key={icon} value={icon}>{icon}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="subtitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sous-titre</FormLabel>
              <FormControl>
                <Input placeholder="Facultatif" {...field} />
              </FormControl>
              <FormDescription>Une ligne sous le titre, quand elle apporte quelque chose.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comment la remplir</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="CRITERIA">Par critères</SelectItem>
                    <SelectItem value="MANUAL">Produits choisis</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="limit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Produits affichés</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={30} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {mode === 'CRITERIA' && (
          <div className="space-y-4 rounded-md border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="categorySlug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie</FormLabel>
                    <FormControl>
                      <Input placeholder="legumes-fruits" {...field} />
                    </FormControl>
                    <FormDescription>Le raccourci de la catégorie, vide pour toutes.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sortBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Classement</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="distance">Les plus proches</SelectItem>
                        <SelectItem value="rating">Les mieux notés</SelectItem>
                        <SelectItem value="price">Les moins chers</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="maxDistanceKm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distance max (km)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={500} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prix max (FCFA)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minRating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note minimale</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={5} step={0.5} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newerThanDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nouveau depuis (jours)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={365} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-6">
              <FormField
                control={form.control}
                name="validatedOnly"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch checked={field.value === true} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Boutiques validées eBio seulement</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="promoOnly"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch checked={field.value === true} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">En promotion seulement</FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </div>
        )}

        {mode === 'MANUAL' && (
          <div className="space-y-3 rounded-md border p-4">
            <Label htmlFor="section-product-search">Chercher un produit</Label>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
              <Input
                id="section-product-search"
                className="pl-8"
                placeholder="Deux lettres suffisent"
                value={term}
                onChange={event => setTerm(event.target.value)}
              />
            </div>

            {found.length > 0 && (
              <ul className="divide-y rounded-md border">
                {found
                  .filter(product => !picked.some(already => already.id === product.id))
                  .map(product => (
                    <li key={product.id} className="flex items-center justify-between p-2 text-sm">
                      <span>
                        {product.name}
                        <span className="text-muted-foreground">
                          {' '}
                          ·
                          {product.shopName}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPicked(current => [...current, product])
                          setTerm('')
                        }}
                      >
                        Ajouter
                      </Button>
                    </li>
                  ))}
              </ul>
            )}

            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">
                {picked.length === 0
                  ? 'Aucun produit choisi. La section ne peut pas être enregistrée vide.'
                  : `${picked.length} produit(s), dans cet ordre :`}
              </p>
              <ul className="space-y-1">
                {picked.map(product => (
                  <li key={product.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                    <span>
                      {product.name}
                      <span className="text-muted-foreground">
                        {' '}
                        ·
                        {product.shopName}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Retirer ${product.name}`}
                      onClick={() => setPicked(current => current.filter(item => item.id !== product.id))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending || (mode === 'MANUAL' && picked.length === 0)}>
            Enregistrer
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Form>
  )
}
