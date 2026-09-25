import {
  adminCartsControllerAttemptsFor,
  adminCartsControllerCartOf,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { useState } from 'react'
import { ProductThumb } from '../../common/components/product-thumb'

interface Attempt {
  id: string
  kind: 'QUOTE' | 'ORDER'
  outcome: 'OK' | 'REFUSED'
  detail: string | null
  shopCount: number
  itemCount: number
  total: number
  distanceKm: number | null
  at: string
}

interface CartLine {
  name: string
  supplierName: string
  imageUrl: string | null
  quantity: number
  pricePerUnit: number
}

function money(value: number): string {
  return `${value.toLocaleString('fr-FR')} FCFA`
}

function moment(value: string): string {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** What an attempt amounted to, for someone reading it out on the phone. */
function summarise(attempt: Attempt): string {
  const parts = [`${attempt.itemCount} article${attempt.itemCount > 1 ? 's' : ''}`]
  if (attempt.shopCount > 0) {
    parts.push(`${attempt.shopCount} boutique${attempt.shopCount > 1 ? 's' : ''}`)
  }
  if (attempt.total > 0) {
    parts.push(money(attempt.total))
  }
  if (attempt.distanceKm !== null) {
    parts.push(`${attempt.distanceKm.toFixed(1)} km`)
  }
  return parts.join(' · ')
}

/**
 * What this buyer tried, and — on request — what is in their basket.
 *
 * The attempts come first because they are what answers "I can't order": the
 * contents are almost never the problem, and reading them is a cost that
 * should be paid deliberately rather than by default.
 */
export function BuyerCheckoutPanel({ userId }: { userId: string }) {
  const [showCart, setShowCart] = useState(false)

  const { data: attempts = [], isLoading } = useQuery({
    queryKey: ['admin', 'carts', 'attempts', userId],
    queryFn: async () => {
      const response = await adminCartsControllerAttemptsFor({ query: { userId } as never })
      if (response.error)
        throw new Error('Failed to load attempts')
      return (response.data as unknown as { attempts: Attempt[] }).attempts
    },
  })

  const { data: cart } = useQuery({
    queryKey: ['admin', 'carts', 'of', userId],
    enabled: showCart,
    queryFn: async () => {
      const response = await adminCartsControllerCartOf({ query: { userId } as never })
      if (response.error)
        throw new Error('Failed to load cart')
      return response.data as unknown as { items: CartLine[], updatedAt: string | null }
    },
  })

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Dernières tentatives de commande</CardTitle>
          <p className="text-muted-foreground text-sm">
            Ce que l'acheteur a tenté et ce que le serveur a répondu.
          </p>
        </div>
        {!showCart && (
          <Button size="sm" variant="outline" onClick={() => setShowCart(true)}>
            <Eye className="mr-2 h-4 w-4" />
            Voir son panier
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading
          ? <Skeleton className="h-32 w-full" />
          : attempts.length === 0
            ? <p className="text-muted-foreground text-sm">Aucune tentative enregistrée.</p>
            : (
                <ul className="divide-y">
                  {attempts.map(attempt => (
                    <li key={attempt.id} className="flex items-start gap-3 py-2">
                      <span className="text-muted-foreground w-28 shrink-0 text-sm">
                        {moment(attempt.at)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {attempt.kind === 'ORDER' ? 'Commande' : 'Devis'}
                          </span>
                          <Badge variant={attempt.outcome === 'REFUSED' ? 'destructive' : 'outline'}>
                            {attempt.outcome === 'REFUSED' ? 'Refusé' : 'Abouti'}
                          </Badge>
                        </div>
                        {attempt.detail && (
                          <p className="text-destructive text-sm">{attempt.detail}</p>
                        )}
                        <p className="text-muted-foreground text-sm">{summarise(attempt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

        {showCart && (
          <div className="space-y-2 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">Panier en cours</p>
              <span className="text-muted-foreground text-xs">
                {cart?.updatedAt ? `modifié le ${moment(cart.updatedAt)}` : 'jamais synchronisé'}
              </span>
            </div>
            {cart === undefined
              ? <Skeleton className="h-16 w-full" />
              : cart.items.length === 0
                ? <p className="text-muted-foreground text-sm">Le panier est vide.</p>
                : (
                    <ul className="divide-y">
                      {cart.items.map(item => (
                        <li key={`${item.supplierName}-${item.name}`} className="flex items-center gap-3 py-1.5 text-sm">
                          {/* A product is never a name on its own. */}
                          <ProductThumb url={item.imageUrl} size={36} />
                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
                            <span className="text-muted-foreground">
                              {' · '}
                              {item.supplierName}
                            </span>
                          </span>
                          <span className="shrink-0">
                            {`×${item.quantity} · ${money(item.pricePerUnit * item.quantity)}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
