import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { AdminDeliveriesService } from '../../deliveries/admin-deliveries.service'
import { DeliveriesModule } from '../../deliveries/deliveries.module'
import { MediaService } from '../../media/media.service'
import { GiftProofPurgeScheduler } from '../gift-proof-purge.scheduler'
import { insertProofMedia, seedDeliveryInTransit } from './gift-fixtures'

async function deliveredWithProof(em: EntityManager, options: { gift: boolean, daysAgo: number, far?: boolean }) {
  const fixture = await seedDeliveryInTransit(em, { gift: options.gift })
  const mediaId = await insertProofMedia(em, fixture.courierUserId)
  await em.getConnection().execute(
    `UPDATE deliveries
     SET status = 'DELIVERED', delivered_at = NOW() - make_interval(days => ?),
         proof_type = 'CODE_AND_PHOTO', proof_media_id = ?, proof_latitude = 6.36, proof_longitude = 2.39,
         proof_taken_at = NOW() - make_interval(days => ?), proof_distance_m = ?, proof_far = ?
     WHERE id = ?`,
    [options.daysAgo, mediaId, options.daysAgo, options.far ? 1200 : 20, options.far === true, fixture.deliveryIds[0]],
  )
  return { ...fixture, mediaId }
}

async function proofMediaOf(em: EntityManager, deliveryId: string): Promise<string | null> {
  const [row] = await em.getConnection().execute(`SELECT proof_media_id FROM deliveries WHERE id = ?`, [deliveryId]) as Array<{ proof_media_id: string | null }>
  return row.proof_media_id
}

/** Hand-over photos of carts sent to a relative live 90 days (FR-017); the rest of the proof stays. */
describe('purge des photos de remise (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('supprime la photo d\'une remise à un proche vieille de plus de 90 jours, et elle seule', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const deleteMedia = vi.spyOn(app.get(MediaService), 'deleteMedia').mockResolvedValue(undefined)
    const old = await deliveredWithProof(em, { gift: true, daysAgo: 91 })
    const recent = await deliveredWithProof(em, { gift: true, daysAgo: 30 })
    const ordinary = await deliveredWithProof(em, { gift: false, daysAgo: 120 })

    expect(await app.get(GiftProofPurgeScheduler).purge()).toBe(1)

    expect(deleteMedia).toHaveBeenCalledExactlyOnceWith(old.mediaId)
    expect(await proofMediaOf(em, old.deliveryIds[0])).toBeNull()
    expect(await proofMediaOf(em, recent.deliveryIds[0])).toBe(recent.mediaId)
    expect(await proofMediaOf(em, ordinary.deliveryIds[0])).toBe(ordinary.mediaId)

    // Position and distance stay for the record.
    const [kept] = await em.getConnection().execute(
      `SELECT proof_latitude, proof_distance_m FROM deliveries WHERE id = ?`,
      [old.deliveryIds[0]],
    ) as Array<{ proof_latitude: number, proof_distance_m: number }>
    expect(kept.proof_latitude).toBe(6.36)
    expect(kept.proof_distance_m).toBe(20)
  })

  it('liste au back-office les preuves prises loin de la porte', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const far = await deliveredWithProof(em, { gift: true, daysAgo: 1, far: true })
    await deliveredWithProof(em, { gift: true, daysAgo: 1 })

    const result = await app.get(AdminDeliveriesService).listFarProofs(1, 20)

    expect(result.total).toBe(1)
    expect(result.deliveries[0].id).toBe(far.deliveryIds[0])
    expect(result.deliveries[0].proofDistanceM).toBe(1200)
  })
})
