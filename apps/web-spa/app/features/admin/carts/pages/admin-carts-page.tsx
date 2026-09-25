import { Card, CardContent, CardHeader, CardTitle } from '@boilerstone/ui/components/primitives/card'
import { CartReminderForm } from '../components/cart-reminder-form'
import { CartsOverview } from '../components/carts-overview'

/**
 * The baskets, under Ventes rather than Configuration.
 *
 * How many people stop before paying is a question about sales, not a
 * setting. The delay that decides when a basket counts as abandoned sits on
 * the same page because it is the number every figure above is measured
 * against — reading one without the other explains nothing.
 */
export default function AdminCartsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Paniers</h1>
        <p className="text-muted-foreground">
          Ce que les acheteurs ont mis de côté sans passer commande.
        </p>
      </div>

      <CartsOverview />

      <Card>
        <CardHeader>
          <CardTitle>Relance des paniers abandonnés</CardTitle>
          <p className="text-muted-foreground text-sm">
            Un panier oublié quelques heures n'est pas une décision : c'est un téléphone
            qui a sonné. Un message le dit ; une série dit autre chose.
          </p>
        </CardHeader>
        <CardContent>
          <CartReminderForm />
        </CardContent>
      </Card>
    </div>
  )
}
