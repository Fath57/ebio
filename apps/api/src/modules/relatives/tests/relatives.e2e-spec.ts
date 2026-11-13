import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import type { CreateRelative } from '../contracts/relative.contract'
import { NotFoundException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { RELATIVES_LIMIT } from '../contracts/relative.contract'
import { RelativesModule } from '../relatives.module'
import { RelativesService } from '../relatives.service'

function relative(index: number, overrides: Partial<CreateRelative> = {}): CreateRelative {
  return {
    nickname: `Proche ${index}`,
    name: 'Afiavi Kossou',
    phone: `+22901970${String(index).padStart(5, '0')}`,
    address: 'Cadjèhoun, rue après la pharmacie, portail bleu',
    latitude: 6.3576,
    longitude: 2.3912,
    ...overrides,
  }
}

/** The error body a refusal carries, for its `code`. */
async function refusal(promise: Promise<unknown>): Promise<{ status: number, code: unknown }> {
  try {
    await promise
  }
  catch (error) {
    const typed = error as { getStatus?: () => number, getResponse?: () => unknown }
    const body = typed.getResponse?.()
    return {
      status: typed.getStatus?.() ?? 0,
      code: typeof body === 'object' && body !== null ? (body as Record<string, unknown>).code : undefined,
    }
  }
  throw new Error('L\'opération aurait dû être refusée')
}

/** The payer's address book of relatives (US4). */
describe('carnet de proches (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm }, {
      imports: [RelativesModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('refuse le 21e proche', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const service = app.get(RelativesService)
    const owner = await createUserData(em)
    for (let index = 0; index < RELATIVES_LIMIT; index++) {
      await service.create(owner.id, relative(index))
    }

    expect(await refusal(service.create(owner.id, relative(RELATIVES_LIMIT)))).toEqual({ status: 422, code: 'RELATIVES_LIMIT_REACHED' })
    expect(await service.list(owner.id)).toHaveLength(RELATIVES_LIMIT)
  })

  it('refuse un numéro déjà enregistré, à la création comme à la modification', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const service = app.get(RelativesService)
    const owner = await createUserData(em)
    await service.create(owner.id, relative(1))
    const other = await service.create(owner.id, relative(2))

    expect(await refusal(service.create(owner.id, relative(3, { phone: relative(1).phone })))).toEqual({ status: 409, code: 'RELATIVE_PHONE_EXISTS' })
    expect(await refusal(service.update(owner.id, other.id, { phone: relative(1).phone }))).toEqual({ status: 409, code: 'RELATIVE_PHONE_EXISTS' })

    // The same number in someone else's book is their business.
    const someoneElse = await createUserData(em)
    await expect(service.create(someoneElse.id, relative(1))).resolves.toBeDefined()
  })

  it('un autre compte ne lit, ne modifie ni ne supprime le proche', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const service = app.get(RelativesService)
    const owner = await createUserData(em)
    const intruder = await createUserData(em)
    const saved = await service.create(owner.id, relative(1))

    expect(await service.list(intruder.id)).toEqual([])
    await expect(service.update(intruder.id, saved.id, { nickname: 'Volé' })).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.remove(intruder.id, saved.id)).rejects.toBeInstanceOf(NotFoundException)

    const updated = await service.update(owner.id, saved.id, { nickname: 'Maman' })
    expect(updated.nickname).toBe('Maman')
  })

  it('supprimer un proche laisse le passage en caisse intact', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const service = app.get(RelativesService)
    const owner = await createUserData(em)
    const saved = await service.create(owner.id, relative(1))
    const db = em.getConnection()
    const [checkout] = await db.execute(
      `INSERT INTO checkouts (buyer_id, total_amount, items_total, payment_method, status, delivery_mode,
                              delivery_address, delivery_latitude, delivery_longitude,
                              recipient_name, recipient_phone, saved_relative_id, tracking_token, "createdAt", "updatedAt")
       VALUES (?, 5000, 5000, 'FEDAPAY', 'PAID', 'DELIVERY', 'Cadjèhoun, portail bleu', 6.3576, 2.3912,
               'Afiavi Kossou', ?, ?, 'tok-relatives-test', NOW(), NOW())
       RETURNING id`,
      [owner.id, saved.phone, saved.id],
    ) as Array<{ id: string }>

    await service.remove(owner.id, saved.id)

    const [after] = await db.execute(
      `SELECT saved_relative_id, recipient_name, recipient_phone FROM checkouts WHERE id = ?`,
      [checkout.id],
    ) as Array<{ saved_relative_id: string | null, recipient_name: string, recipient_phone: string }>
    expect(after).toEqual({ saved_relative_id: null, recipient_name: 'Afiavi Kossou', recipient_phone: saved.phone })
  })
})
