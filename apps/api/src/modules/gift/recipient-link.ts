import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * Whether `userId` is the relative a cart was sent to: their phone number is
 * the one the payer typed, and it was proven by an SMS code (research §9). A
 * number merely typed in a profile links nothing — anyone could type anyone's.
 *
 * A plain function on the entity manager, not a service: ratings and
 * deliveries ask it without depending on the gift module.
 */
export async function isLinkedRecipient(em: EntityManager, orderId: string, userId: string): Promise<boolean> {
  const rows = await em.getConnection().execute(
    `SELECT 1
     FROM orders o
     JOIN checkouts c ON c.id = o.checkout_id
     JOIN users u ON u.id = ?
     WHERE o.id = ?
       AND c.recipient_phone IS NOT NULL
       AND u.phone = c.recipient_phone
       AND u.phone_verified_at IS NOT NULL
     LIMIT 1`,
    [userId, orderId],
  ) as unknown[]
  return rows.length > 0
}
