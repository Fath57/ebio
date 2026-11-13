import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { RolesModule } from '../../auth/roles/roles.module'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { insertProofMedia, RECIPIENT_PHONE, seedDeliveryInTransit } from '../../gift/tests/gift-fixtures'
import { AdminModule } from '../admin.module'
import { AdminService } from '../admin.service'
import { AuditModule } from '../audit.module'
import { readOrderFilters } from '../order-filters'

/** The back-office reads a cart sent to a relative: who paid, who receives, the proof. */
describe('commandes pour un proche au back-office (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule, AdminModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('filtre les commandes pour un proche et détaille payeur, proche, devise et preuve', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const admin = app.get(AdminService)
    const gift = await seedDeliveryInTransit(em)
    const ordinary = await seedDeliveryInTransit(em, { gift: false })
    const mediaId = await insertProofMedia(em, gift.courierUserId)
    const db = em.getConnection()
    await db.execute(
      `UPDATE checkouts SET display_currency = 'EUR', fx_rate = 642.837860, fx_margin_bps = 200, display_total = 15.56 WHERE id = ?`,
      [gift.checkoutId],
    )
    await db.execute(
      `UPDATE deliveries SET status = 'DELIVERED', delivered_at = NOW(), proof_type = 'CODE_AND_PHOTO', proof_media_id = ?,
              proof_latitude = 6.36, proof_longitude = 2.39, proof_taken_at = NOW(), proof_distance_m = 450, proof_far = true
       WHERE id = ?`,
      [mediaId, gift.deliveryIds[0]],
    )

    const gifts = await admin.getOrders({ filters: readOrderFilters({ gift: 'true' }), page: 1, limit: 20 })
    expect(gifts.items.map(item => (item as { id: string }).id)).toEqual([gift.orderIds[0]])
    expect(gifts.items[0]).toMatchObject({ isGift: true })
    const others = await admin.getOrders({ filters: readOrderFilters({ gift: 'false' }), page: 1, limit: 20 })
    expect(others.items.map(item => (item as { id: string }).id)).toEqual([ordinary.orderIds[0]])

    const detail = await admin.getOrderById(gift.orderIds[0])
    expect(detail).toMatchObject({
      isGift: true,
      gift: {
        payer: { id: gift.buyerId, name: 'Awa Diallo' },
        recipient: { name: 'Afiavi Kossou', phone: RECIPIENT_PHONE },
      },
      display: { currency: 'EUR', rate: 642.83786, total: 15.56 },
      proof: { distanceM: 450, far: true },
    })
    expect((detail as { proof: { photoUrl: string } }).proof.photoUrl).toContain('X-Amz-Signature')

    expect(await admin.getOrderById(ordinary.orderIds[0])).toMatchObject({ isGift: false, gift: null, display: null, proof: null })
  })
})
