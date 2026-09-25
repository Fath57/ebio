import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'

export interface CartStats {
  /** Baskets holding something, whatever their age. */
  actifs: number
  /** Of those, the ones that have not moved for the reminder delay. */
  abandonnes: number
  /** What sits in the abandoned ones, in FCFA. */
  montantAbandonne: number
  /** Reminders sent that were followed by an order within a day. */
  relancesAbouties: number
  relancesEnvoyees: number
  produitsAbandonnes: Array<{ name: string, shopName: string, imageUrl: string | null, baskets: number, quantity: number }>
}

/**
 * What the baskets say as a whole.
 *
 * Counts and totals, never a name: the question here is how many people stop
 * before paying and on what, not who they are.
 */
@Injectable()
export class CartStatsService {
  constructor(private readonly em: EntityManager) {}

  async summary(abandonAfterHours: number): Promise<CartStats> {
    const connection = this.em.getConnection()

    const [totals] = await connection.execute<Array<{
      actifs: string
      abandonnes: string
      montant: string
      relances: string
    }>>(
      `SELECT
         COUNT(DISTINCT c.id)::text AS actifs,
         COUNT(DISTINCT c.id) FILTER (WHERE c.updated_at <= NOW() - (? * INTERVAL '1 hour'))::text AS abandonnes,
         COALESCE(SUM(ci.unit_price * ci.quantity) FILTER (WHERE c.updated_at <= NOW() - (? * INTERVAL '1 hour')), 0)::text AS montant,
         COALESCE(SUM(c.reminders), 0)::text AS relances
       FROM carts c
       JOIN cart_items ci ON ci.cart_id = c.id`,
      // One value per placeholder: the driver binds `?` by position, it does
      // not reuse a numbered parameter.
      [abandonAfterHours, abandonAfterHours],
    )

    // A reminder counts as having worked when an order follows it within a
    // day. Not proof it caused the order — nothing here could prove that —
    // but it is the figure that says whether to keep sending them.
    const [followed] = await connection.execute<Array<{ count: string }>>(
      `SELECT COUNT(DISTINCT c.user_id)::text AS count
       FROM carts c
       WHERE c.reminded_at IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM orders o
           WHERE o.buyer_id = c.user_id
             AND o."createdAt" > c.reminded_at
             AND o."createdAt" < c.reminded_at + INTERVAL '1 day'
         )`,
    )

    const products = await connection.execute<Array<{
      name: string
      shop_name: string
      photo: string | null
      baskets: string
      quantity: string
    }>>(
      // The photo travels with the name: a list of product names alone is not
      // a list anyone reads — "huile d'arachide" and "huile de palme" look the
      // same at a glance, their pictures do not.
      `SELECT ci.product_name AS name,
              s.shop_name,
              -- photos is jsonb, not a Postgres array: a subscript would be
              -- read as a JSON path and quietly give nothing.
              MIN(p.photos->>0) AS photo,
              COUNT(DISTINCT ci.cart_id)::text AS baskets,
              SUM(ci.quantity)::text AS quantity
       FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       JOIN suppliers s ON s.id = ci.supplier_id
       JOIN products p ON p.id = ci.product_id
       WHERE c.updated_at <= NOW() - (? * INTERVAL '1 hour')
       GROUP BY ci.product_name, s.shop_name
       ORDER BY COUNT(DISTINCT ci.cart_id) DESC
       LIMIT 10`,
      [abandonAfterHours],
    )

    return {
      actifs: Number(totals?.actifs ?? 0),
      abandonnes: Number(totals?.abandonnes ?? 0),
      montantAbandonne: Number(totals?.montant ?? 0),
      relancesEnvoyees: Number(totals?.relances ?? 0),
      relancesAbouties: Number(followed?.count ?? 0),
      produitsAbandonnes: products.map(row => ({
        name: row.name,
        shopName: row.shop_name,
        imageUrl: row.photo ?? null,
        baskets: Number(row.baskets),
        quantity: Number(row.quantity),
      })),
    }
  }
}
