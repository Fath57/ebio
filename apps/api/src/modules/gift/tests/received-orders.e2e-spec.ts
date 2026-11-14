import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { CourierFeedbackService } from '../../deliveries/courier-feedback.service'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { DeliveriesService } from '../../deliveries/deliveries.service'
import { OrdersController } from '../../orders/orders.controller'
import { ProductReviewsService } from '../../ratings/product-reviews.service'
import { RatingsModule } from '../../ratings/ratings.module'
import { RatingsService } from '../../ratings/ratings.service'
import { addOrderLine, RECIPIENT_PHONE, seedDeliveryInTransit } from './gift-fixtures'

const AMOUNT_KEY = /price|amount|total|fee/i

function sessionOf(userId: string) {
  return { user: { id: userId, role: 'BUYER' } } as Parameters<OrdersController['findReceived']>[0]
}

/** As a fresh request would: nothing remembered from the previous one. */
async function received(app: INestApplication, userId: string) {
  app.get(EntityManager).clear()
  return app.get(OrdersController).findReceived(sessionOf(userId))
}

async function deliver(em: EntityManager, orderId: string, deliveryId: string): Promise<void> {
  const db = em.getConnection()
  await db.execute(`UPDATE orders SET status = 'DELIVERED', delivered_at = NOW() WHERE id = ?`, [orderId])
  await db.execute(`UPDATE deliveries SET status = 'DELIVERED', delivered_at = NOW() WHERE id = ?`, [deliveryId])
}

/**
 * « Paniers reçus »: a cart sent to a number shows on the account that
 * proved owning it by SMS, and on no other, and not after the number
 * changed. The relative may rate what they received.
 */
describe('paniers reçus par le proche (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, RatingsModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('montre le panier au compte vérifié par SMS, sans aucun montant', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    const productId = await addOrderLine(em, fixture.orderIds[0], 'Tomates fraîches bio', 3)
    const relative = await createUserData(em, { name: 'Afiavi Kossou', phone: RECIPIENT_PHONE, phoneVerifiedAt: new Date() })

    const result = await received(app, relative.id)

    expect(result.total).toBe(1)
    expect(result.items[0]).toMatchObject({
      orderId: fixture.orderIds[0],
      payerFirstName: 'Awa',
      shopName: 'Fruits Fatou',
      status: 'IN_DELIVERY',
      lines: [{ productId, name: 'Tomates fraîches bio', quantity: 3 }],
      canReview: false,
    })
    expect(result.items[0].supplierId).toEqual(expect.any(String))
    // `total` of the envelope counts carts; inside a cart, no amount at all.
    const json = JSON.stringify(result.items)
    expect([...json.matchAll(/"(\w+)":/g)].map(match => match[1]).filter(key => AMOUNT_KEY.test(key))).toEqual([])
  })

  it('ne montre rien à un numéro non vérifié, ni après un changement de numéro', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    await seedDeliveryInTransit(em)
    const typed = await createUserData(em, { name: 'Quelqu\'un', phone: RECIPIENT_PHONE })

    // Typed in a profile, never proven: anyone could type anyone's number.
    expect(await received(app, typed.id)).toEqual({ items: [], total: 0 })

    await em.getConnection().execute(`UPDATE users SET phone_verified_at = NOW() WHERE id = ?`, [typed.id])
    expect((await received(app, typed.id)).total).toBe(1)

    // A new number clears the proof (users.service): the cart goes with the old one.
    await em.getConnection().execute(`UPDATE users SET phone = '+2290197999999', phone_verified_at = NULL WHERE id = ?`, [typed.id])
    expect(await received(app, typed.id)).toEqual({ items: [], total: 0 })
  })

  it('le proche note la boutique, le livreur et les produits après la remise ; un inconnu non', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    await addOrderLine(em, fixture.orderIds[0])
    const relative = await createUserData(em, { name: 'Afiavi Kossou', phone: RECIPIENT_PHONE, phoneVerifiedAt: new Date() })
    const stranger = await createUserData(em, { name: 'Inconnu', phone: '+2290197555555', phoneVerifiedAt: new Date() })
    await deliver(em, fixture.orderIds[0], fixture.deliveryIds[0])

    const [received1] = (await received(app, relative.id)).items
    expect(received1.canReview).toBe(true)

    const shopReview = {
      supplierId: received1.supplierId,
      orderId: fixture.orderIds[0],
      transactionType: 'ORDER' as const,
      qualityRating: 5,
      delayRating: 4,
      communicationRating: 5,
      conformityRating: 5,
    }
    await expect(app.get(RatingsService).createReview(stranger.id, shopReview)).rejects.toThrow()
    const review = await app.get(RatingsService).createReview(relative.id, shopReview)
    expect(review.buyer.id).toBe(relative.id)

    const products = app.get(ProductReviewsService)
    const rateable = await products.listRateableItems(fixture.orderIds[0], relative.id)
    expect(rateable.items).toHaveLength(1)
    const reviews = { reviews: [{ orderItemId: rateable.items[0].orderItemId, rating: 5 }] }
    await expect(products.createMany(fixture.orderIds[0], stranger.id, reviews)).rejects.toThrow()
    expect(await products.createMany(fixture.orderIds[0], relative.id, reviews)).toEqual({ created: 1, skipped: 0 })

    // The courier: the relative reads the delivery without its amounts, and rates it.
    const { audience } = await app.get(DeliveriesService).getByOrderForRequester(fixture.orderIds[0], relative.id)
    expect(audience).toBe('recipient')
    await expect(app.get(DeliveriesService).getByOrderForRequester(fixture.orderIds[0], stranger.id)).rejects.toThrow()
    const feedback = app.get(CourierFeedbackService)
    await expect(feedback.rate(fixture.deliveryIds[0], stranger.id, { rating: 4 })).rejects.toThrow()
    const rating = await feedback.rate(fixture.deliveryIds[0], relative.id, { rating: 5 })
    expect(rating.rating).toBe(5)
    // A tip spends the caller's wallet: the payer's gesture only.
    await expect(feedback.tip(fixture.deliveryIds[0], relative.id, { amount: 500 })).rejects.toThrow()
  })

  it('le payeur garde le droit de noter', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const fixture = await seedDeliveryInTransit(em)
    await deliver(em, fixture.orderIds[0], fixture.deliveryIds[0])
    const rating = await app.get(CourierFeedbackService).rate(fixture.deliveryIds[0], fixture.buyerId, { rating: 4 })
    expect(rating.rating).toBe(4)
  })
})
