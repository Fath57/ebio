import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import {
  HANDOVER_CODE,
  insertProofMedia,
  PORTE_DU_PROCHE,
  seedDeliveryInTransit,
  UN_KM_PLUS_LOIN,
} from '../../gift/tests/gift-fixtures'
import { DeliveriesModule } from '../deliveries.module'
import { DeliveriesService } from '../deliveries.service'

/** The error body a refusal carries, for its `code`. */
async function refusal(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise
  }
  catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.()
    return (typeof response === 'object' && response !== null ? response : {}) as Record<string, unknown>
  }
  throw new Error('La remise aurait dû être refusée')
}

/**
 * The hand-over proof of a cart sent to a relative: code, photo and position
 * together, checked against a real PostGIS database — the distance is an
 * `ST_Distance` in geography, which only a real server computes.
 */
describe('preuve de remise à un proche (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, DeliveriesModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('refuse le code seul pour un proche, l\'accepte pour une commande ordinaire', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const deliveries = app.get(DeliveriesService)

    const gift = await seedDeliveryInTransit(em)
    const body = await refusal(deliveries.complete(gift.deliveryIds[0], gift.courierUserId, { proofType: 'CODE', code: HANDOVER_CODE }))
    expect(body.code).toBe('GIFT_PROOF_REQUIRED')

    const ordinary = await seedDeliveryInTransit(em, { gift: false })
    const done = await deliveries.complete(ordinary.deliveryIds[0], ordinary.courierUserId, { proofType: 'CODE', code: HANDOVER_CODE })
    expect(done.status).toBe('DELIVERED')
  })

  it('refuse la photo envoyée par un autre livreur', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const deliveries = app.get(DeliveriesService)
    const fixture = await seedDeliveryInTransit(em)
    const foreign = await insertProofMedia(em, fixture.otherCourierUserId)

    const body = await refusal(deliveries.complete(fixture.deliveryIds[0], fixture.courierUserId, {
      proofType: 'CODE_AND_PHOTO',
      code: HANDOVER_CODE,
      mediaId: foreign,
      latitude: PORTE_DU_PROCHE.latitude,
      longitude: PORTE_DU_PROCHE.longitude,
    }))
    expect(body.code).toBe('INVALID_PROOF_MEDIA')

    // A photo of the right courier but uploaded for something else is no proof either.
    const avatar = await insertProofMedia(em, fixture.courierUserId, 'CHAT_ATTACHMENT')
    const second = await refusal(deliveries.complete(fixture.deliveryIds[0], fixture.courierUserId, {
      proofType: 'CODE_AND_PHOTO',
      code: HANDOVER_CODE,
      mediaId: avatar,
      latitude: PORTE_DU_PROCHE.latitude,
      longitude: PORTE_DU_PROCHE.longitude,
    }))
    expect(second.code).toBe('INVALID_PROOF_MEDIA')
  })

  it('accepte une remise à 1 km mais la signale', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const deliveries = app.get(DeliveriesService)
    const fixture = await seedDeliveryInTransit(em)
    const photo = await insertProofMedia(em, fixture.courierUserId)
    const takenAt = new Date(Date.now() - 60_000).toISOString()

    const done = await deliveries.complete(fixture.deliveryIds[0], fixture.courierUserId, {
      proofType: 'CODE_AND_PHOTO',
      code: HANDOVER_CODE,
      mediaId: photo,
      latitude: UN_KM_PLUS_LOIN.latitude,
      longitude: UN_KM_PLUS_LOIN.longitude,
      occurredAt: takenAt,
    })
    expect(done.status).toBe('DELIVERED')

    const [row] = await em.getConnection().execute(
      `SELECT proof_type, proof_media_id, proof_far, proof_distance_m, proof_taken_at, proof_latitude
       FROM deliveries WHERE id = ?`,
      [fixture.deliveryIds[0]],
    ) as Array<{ proof_type: string, proof_media_id: string, proof_far: boolean, proof_distance_m: number, proof_taken_at: Date, proof_latitude: number }>
    expect(row.proof_type).toBe('CODE_AND_PHOTO')
    expect(row.proof_media_id).toBe(photo)
    expect(row.proof_far).toBe(true)
    expect(row.proof_distance_m).toBeGreaterThan(900)
    expect(row.proof_distance_m).toBeLessThan(1100)
    expect(new Date(row.proof_taken_at).toISOString()).toBe(takenAt)
    expect(row.proof_latitude).toBeCloseTo(UN_KM_PLUS_LOIN.latitude, 5)
  })

  it('ne signale pas une remise à la porte', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const deliveries = app.get(DeliveriesService)
    const fixture = await seedDeliveryInTransit(em)
    const photo = await insertProofMedia(em, fixture.courierUserId)

    await deliveries.complete(fixture.deliveryIds[0], fixture.courierUserId, {
      proofType: 'CODE_AND_PHOTO',
      code: HANDOVER_CODE,
      mediaId: photo,
      latitude: PORTE_DU_PROCHE.latitude + 0.0002,
      longitude: PORTE_DU_PROCHE.longitude,
    })
    const [row] = await em.getConnection().execute(
      `SELECT proof_far, proof_distance_m FROM deliveries WHERE id = ?`,
      [fixture.deliveryIds[0]],
    ) as Array<{ proof_far: boolean, proof_distance_m: number }>
    expect(row.proof_far).toBe(false)
    expect(row.proof_distance_m).toBeLessThan(50)
  })

  it('recopie la même preuve sur les deux commandes d\'une tournée', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const deliveries = app.get(DeliveriesService)
    const fixture = await seedDeliveryInTransit(em, { run: true })
    const photo = await insertProofMedia(em, fixture.courierUserId)

    const codeOnly = await refusal(deliveries.deliverRun(fixture.runId!, fixture.courierUserId, { proofType: 'CODE', code: HANDOVER_CODE }))
    expect(codeOnly.code).toBe('GIFT_PROOF_REQUIRED')

    await deliveries.deliverRun(fixture.runId!, fixture.courierUserId, {
      proofType: 'CODE_AND_PHOTO',
      code: HANDOVER_CODE,
      mediaId: photo,
      latitude: UN_KM_PLUS_LOIN.latitude,
      longitude: UN_KM_PLUS_LOIN.longitude,
    })

    const rows = await em.getConnection().execute(
      `SELECT status, proof_type, proof_media_id, proof_latitude, proof_longitude, proof_taken_at, proof_distance_m, proof_far
       FROM deliveries WHERE delivery_run_id = ?`,
      [fixture.runId],
    ) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.status === 'DELIVERED' && row.proof_type === 'CODE_AND_PHOTO' && row.proof_far === true)).toBe(true)
    const [first, second] = rows.map(({ status: _status, ...proof }) => ({
      ...proof,
      proof_taken_at: new Date(proof.proof_taken_at as string).toISOString(),
    }))
    expect(second).toEqual(first)
  })
})
