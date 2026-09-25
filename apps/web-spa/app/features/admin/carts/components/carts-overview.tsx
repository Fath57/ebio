import {
  adminCartsControllerSummary,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useQuery } from '@tanstack/react-query'

interface CartStats {
  abandonApresHeures: number
  actifs: number
  abandonnes: number
  montantAbandonne: number
  relancesEnvoyees: number
  relancesAbouties: number
  produitsAbandonnes: Array<{ name: string, shopName: string, baskets: number, quantity: number }>
}

function money(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function Figure({ label, value, hint }: { label: string, value: string, hint?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

/**
 * What the baskets say as a whole.
 *
 * Counts and totals, never a name. The question here is how many people stop
 * before paying and on what — who they are is a different question, asked
 * elsewhere and under a different permission.
 */
export function CartsOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'carts', 'stats'],
    queryFn: async () => {
      const response = await adminCartsControllerSummary()
      if (response.error)
        throw new Error('Failed to load cart stats')
      return response.data as unknown as CartStats
    },
  })

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />
  }

  // A basket that draws a reminder and an order within the day. Not proof the
  // reminder caused it — nothing here could prove that — but it is the figure
  // that says whether to keep sending them.
  const conversion = data.relancesEnvoyees === 0
    ? null
    : Math.round((data.relancesAbouties / data.relancesEnvoyees) * 100)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Paniers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Paniers actifs" value={String(data.actifs)} hint="contenant au moins un article" />
          <Figure
            label="Abandonnés"
            value={String(data.abandonnes)}
            hint={`sans mouvement depuis ${data.abandonApresHeures} h`}
          />
          <Figure label="Montant en attente" value={money(data.montantAbandonne)} />
          <Figure
            label="Relances envoyées"
            value={String(data.relancesEnvoyees)}
            hint={conversion === null ? 'aucune relance encore' : `${conversion} % suivies d'une commande`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ce qui reste le plus souvent en rade</CardTitle>
        </CardHeader>
        <CardContent>
          {data.produitsAbandonnes.length === 0
            ? <p className="text-muted-foreground text-sm">Aucun panier abandonné pour l'instant.</p>
            : (
                <ul className="divide-y">
                  {data.produitsAbandonnes.map(product => (
                    <li key={`${product.shopName}-${product.name}`} className="flex items-center justify-between py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="text-muted-foreground text-sm">{product.shopName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          {product.baskets}
                          {product.baskets > 1 ? ' paniers' : ' panier'}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {product.quantity}
                          {' '}
                          au total
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
        </CardContent>
      </Card>
    </div>
  )
}
