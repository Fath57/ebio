import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
/**
 * Dispatching a run, exercised against a real PostGIS database.
 *
 * What is tested here is tested nowhere else: the raw queries. The
 * typecheck says nothing about a malformed `array_position` or a `LATERAL` the
 * server refuses to compile — they have to be executed.
 *
 * Three questions, in the order they arise:
 *   1. does the run find couriers from its pickup point?
 *   2. can a courier take it whole, and does the visiting order start from
 *      where they are?
 *   3. do its deliveries stay out of the lone-delivery offer list?
 */
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { OrdersService } from '../../orders/orders.service'
import { CompensationService } from '../../payments/compensation.service'
import { DeliveriesMapper } from '../deliveries.mapper'
import { DeliveriesModule } from '../deliveries.module'
import { DeliveriesService } from '../deliveries.service'
import { DispatchService } from '../dispatch.service'

/** Cotonou: two neighbouring shops, a buyer a little farther away. */
const FATOU = { latitude: 6.3616, longitude: 2.4264 }
const KOFFI = { latitude: 6.3654, longitude: 2.4183 }
const ACHETEUR = { latitude: 6.3700, longitude: 2.4300 }
/** The courier is parked next to Koffi, not to Fatou. */
const LIVREUR = { latitude: 6.3660, longitude: 2.4180 }
/** A second courier, across the zone: they must rank after. */
const LIVREUR_LOIN = { latitude: 6.3900, longitude: 2.4500 }

interface Fixture {
  runId: string
  courierId: string
  courierUserId: string
  farCourierId: string
  deliveryIds: string[]
}

async function seed(em: EntityManager, options: { shops?: 1 | 2 } = {}): Promise<Fixture> {
  const buyer = await createUserData(em)
  const courierUser = await createUserData(em)
  const farCourierUser = await createUserData(em)
  const shopUserA = await createUserData(em)
  const shopUserB = await createUserData(em)
  await em.flush()

  const db = em.getConnection()

  const insertCourier = async (userId: string, name: string, phone: string, at: { latitude: number, longitude: number }) => {
    const [row] = await db.execute(
      `INSERT INTO courier_profiles
         (user_id, full_name, phone, vehicle_type, zone, validation_status, is_available,
          last_known_location, last_location_at, "createdAt", "updatedAt")
       VALUES (?, ?, ?, 'MOTO', 'Cotonou', 'VALIDATED', true,
               ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, NOW(), NOW(), NOW())
       RETURNING id`,
      [userId, name, phone, at.longitude, at.latitude],
    ) as Array<{ id: string }>
    return row
  }
  const courier = await insertCourier(courierUser.id, 'Livreur Proche', '+22990000000', LIVREUR)
  const farCourier = await insertCourier(farCourierUser.id, 'Livreur Loin', '+22990000001', LIVREUR_LOIN)

  const shopCount = options.shops ?? 2
  const shops: string[] = []
  for (const [index, shopUser] of [shopUserA, shopUserB].slice(0, shopCount).entries()) {
    const point = index === 0 ? FATOU : KOFFI
    const [shop] = await db.execute(
      `INSERT INTO suppliers (user_id, shop_name, type, mode, validation_status, location, "createdAt", "updatedAt")
       VALUES (?, ?, 'TRANSFORMER', 'ORDER', 'VALIDATED', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, NOW(), NOW())
       RETURNING id`,
      [shopUser.id, index === 0 ? 'Fruits Fatou' : 'Huiles Koffi', point.longitude, point.latitude],
    ) as Array<{ id: string }>
    shops.push(shop.id)
  }

  const [checkout] = await db.execute(
    `INSERT INTO checkouts (buyer_id, total_amount, items_total, delivery_fee, payment_method,
                            delivery_mode, delivery_address, delivery_latitude, delivery_longitude,
                            "createdAt", "updatedAt")
     VALUES (?, 6000, 5200, 800, 'WALLET', 'DELIVERY', 'Cadjehoun, près de la pharmacie', ?, ?, NOW(), NOW())
     RETURNING id`,
    [buyer.id, ACHETEUR.latitude, ACHETEUR.longitude],
  ) as Array<{ id: string }>

  const [run] = await db.execute(
    `INSERT INTO delivery_runs (checkout_id, supplier_ids, pickup_order, delivery_fee, courier_earning,
                                shop_count, pickup_spread_km, total_distance_km, "createdAt", "updatedAt")
     VALUES (?, ?::jsonb, '[]'::jsonb, 800, 720, ?, 0.99, 2.1, NOW(), NOW())
     RETURNING id`,
    [checkout.id, JSON.stringify(shops), shopCount],
  ) as Array<{ id: string }>

  const deliveryIds: string[] = []
  for (const [index, shopId] of shops.entries()) {
    const point = index === 0 ? FATOU : KOFFI
    const [order] = await db.execute(
      `INSERT INTO orders (order_number, buyer_id, supplier_id, checkout_id, pickup_mode,
                           payment_method, status, total_amount, delivery_address,
                           delivery_latitude, delivery_longitude, "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 'DELIVERY', 'WALLET', 'READY', 2600, 'Cadjehoun', ?, ?, NOW(), NOW())
       RETURNING id`,
      [`EB-TEST-00${index + 1}`, buyer.id, shopId, checkout.id, ACHETEUR.latitude, ACHETEUR.longitude],
    ) as Array<{ id: string }>

    const [delivery] = await db.execute(
      `INSERT INTO deliveries (order_id, delivery_run_id, pickup_address, dropoff_address,
                               pickup_location, pickup_latitude, pickup_longitude,
                               status, dispatch_phase, delivery_fee, courier_fee,
                               offered_at, "createdAt", "updatedAt")
       VALUES (?, ?, ?, 'Cadjehoun', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?, ?,
               'AWAITING_COURIER', 'BROADCAST', 0, 0, NOW(), NOW(), NOW())
       RETURNING id`,
      [order.id, run.id, index === 0 ? 'Marché Fatou' : 'Dépôt Koffi', point.longitude, point.latitude, point.latitude, point.longitude],
    ) as Array<{ id: string }>
    deliveryIds.push(delivery.id)
  }

  return {
    runId: run.id,
    courierId: courier.id,
    courierUserId: courierUser.id,
    farCourierId: farCourier.id,
    deliveryIds,
  }
}

describe('diffusion d\'une tournée (e2e)', () => {
  beforeEach(async (context) => {
    // Two connections: the courier settlement opens its own transaction
    // while the handover holds its own.
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      // Two modules the application registers globally and that must be
      // named here: roles (for the CASL guard) and audit.
      imports: [RolesModule, AuditModule, DeliveriesModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('trouve le livreur depuis le point de collecte de la tournée', async (context) => {
    const { em, app } = context
    const fixture = await seed(em as EntityManager)
    const dispatch = app.get(DispatchService)

    const target = { kind: 'RUN' as const, id: fixture.runId, broadcastRadiusKm: 10 }

    // Distance is only measurable once the pickup point is set, which
    // opening the dispatch does.
    await dispatch.startRunDispatch(fixture.runId)

    const eligible = await dispatch.findEligibleFor(target)
    expect(eligible.map(c => c.id)).toEqual(expect.arrayContaining([fixture.courierId, fixture.farCourierId]))

    // The near one was already asked when the dispatch opened: they drop out
    // of the ranking, we do not ask twice. The far one remains, with its distance.
    const ranked = await dispatch.rankCandidatesFor(target)
    expect(ranked.map(candidate => candidate.id)).toEqual([fixture.farCourierId])
    expect(ranked[0].distanceKm).not.toBeNull()
    expect(ranked[0].distanceKm!).toBeGreaterThan(2)
  })

  it('fait accepter la tournée entière et ordonne les collectes depuis le livreur', async (context) => {
    const { em, app } = context
    const fixture = await seed(em as EntityManager)
    const dispatch = app.get(DispatchService)
    const deliveries = app.get(DeliveriesService)

    await dispatch.startRunDispatch(fixture.runId)
    const run = await deliveries.acceptRun(fixture.runId, fixture.courierUserId)

    expect(run.status).toBe('ACCEPTED')
    expect(run.pickupOrder).toHaveLength(2)
    // The courier is parked next to Koffi: that is where they start.
    expect(run.pickupOrder[0]).toBe(fixture.deliveryIds[1])

    const rows = await (em as EntityManager).getConnection().execute(
      `SELECT status, courier_id FROM deliveries WHERE delivery_run_id = ?`,
      [fixture.runId],
    ) as Array<{ status: string, courier_id: string | null }>
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.status === 'ACCEPTED' && row.courier_id === fixture.courierId)).toBe(true)
  })

  it('ne propose pas une tournée jamais diffusée', async (context) => {
    const { app, em } = context
    const fixture = await seed(em as EntityManager)
    const deliveries = app.get(DeliveriesService)

    // The run exists, but no shop has prepared yet: there is nothing
    // to collect. Offering it would let a courier accept an empty run.
    const tournees = await deliveries.getRunOffers(fixture.courierUserId)
    expect(tournees.map(row => row.id)).not.toContain(fixture.runId)

    await expect(
      deliveries.acceptRun(fixture.runId, fixture.courierUserId),
    ).rejects.toThrow()
  })
  it('garde les livraisons d\'une tournée hors de la liste des courses isolées', async (context) => {
    const { em, app } = context
    const fixture = await seed(em as EntityManager)
    const deliveries = app.get(DeliveriesService)
    // A run is only offered once dispatched: before that it is neither
    // targeted nor broadcast, and it has no business in the list.
    await app.get(DispatchService).startRunDispatch(fixture.runId)

    const isolees = await deliveries.getOffers(fixture.courierUserId)
    expect(isolees.map(row => row.id)).not.toContain(fixture.deliveryIds[0])

    // The run itself, however, must show up — with its two pickups.
    const tournees = await deliveries.getRunOffers(fixture.courierUserId)
    const proposee = tournees.find(row => row.id === fixture.runId)
    expect(proposee).toBeDefined()
    expect(proposee?.stops).toHaveLength(2)
    expect(Number(proposee?.courier_earning)).toBe(720)
    // The cash figures are THIS run's: the sum of its orders
    // plus its fee, and not the cart total, which also covers the
    // runs this courier is not carrying.
    expect(Number(proposee?.total_amount)).toBe(2600 + 2600 + 800)
  })

  describe('collecte et remise', () => {
    async function tourneeAcceptee(context: { em: unknown, app: INestApplication }) {
      const em = context.em as EntityManager
      const fixture = await seed(em)
      await context.app.get(DispatchService).startRunDispatch(fixture.runId)
      await context.app.get(DeliveriesService).acceptRun(fixture.runId, fixture.courierUserId)
      return fixture
    }

    it('ne fait avancer que la commande de la boutique collectée', async (context) => {
      const { em, app } = context
      const fixture = await tourneeAcceptee(context)
      const deliveries = app.get(DeliveriesService)

      await deliveries.collect(fixture.deliveryIds[0], fixture.courierUserId)

      const rows = await (em as EntityManager).getConnection().execute(
        `SELECT d.id, d.status, o.status AS order_status
         FROM deliveries d JOIN orders o ON o.id = d.order_id
         WHERE d.delivery_run_id = ? ORDER BY d.id = ? DESC`,
        [fixture.runId, fixture.deliveryIds[0]],
      ) as Array<{ id: string, status: string, order_status: string }>

      const collectee = rows.find(row => row.id === fixture.deliveryIds[0])!
      const autre = rows.find(row => row.id !== fixture.deliveryIds[0])!
      expect(collectee.status).toBe('PICKED_UP')
      expect(collectee.order_status).toBe('IN_DELIVERY')
      // The other shop saw nothing move: that is FR-017.
      expect(autre.status).toBe('ACCEPTED')
      expect(autre.order_status).toBe('READY')

      const [run] = await (em as EntityManager).getConnection().execute(
        `SELECT status, confirmation_code FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, confirmation_code: string | null }>
      expect(run.status).toBe('COLLECTING')
      expect(run.confirmation_code).toMatch(/^\d{4}$/)
    })

    it('met la tournée en route à la dernière collecte, avec un seul code', async (context) => {
      const { em, app } = context
      const fixture = await tourneeAcceptee(context)
      const deliveries = app.get(DeliveriesService)

      await deliveries.collect(fixture.deliveryIds[0], fixture.courierUserId)
      const [apresPremiere] = await (em as EntityManager).getConnection().execute(
        `SELECT confirmation_code FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ confirmation_code: string }>

      await deliveries.collect(fixture.deliveryIds[1], fixture.courierUserId)

      const [run] = await (em as EntityManager).getConnection().execute(
        `SELECT status, confirmation_code FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, confirmation_code: string }>
      expect(run.status).toBe('DELIVERING')
      // The code does not change along the way.
      expect(run.confirmation_code).toBe(apresPremiere.confirmation_code)

      const courses = await (em as EntityManager).getConnection().execute(
        `SELECT status, confirmation_code FROM deliveries WHERE delivery_run_id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, confirmation_code: string }>
      expect(courses.every(row => row.status === 'IN_TRANSIT')).toBe(true)
      expect(new Set(courses.map(row => row.confirmation_code))).toEqual(new Set([run.confirmation_code]))
    })

    it('refuse un mauvais code, puis livre toutes les commandes d\'un coup', async (context) => {
      const { em, app } = context
      const fixture = await tourneeAcceptee(context)
      const deliveries = app.get(DeliveriesService)
      await deliveries.collect(fixture.deliveryIds[0], fixture.courierUserId)
      await deliveries.collect(fixture.deliveryIds[1], fixture.courierUserId)

      const [run] = await (em as EntityManager).getConnection().execute(
        `SELECT confirmation_code FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ confirmation_code: string }>
      const faux = run.confirmation_code === '0000' ? '1111' : '0000'

      await expect(
        deliveries.deliverRun(fixture.runId, fixture.courierUserId, { proofType: 'CODE', code: faux }),
      ).rejects.toThrow()

      // A refused code leaves nothing behind: the run is still on the road.
      const [avant] = await (em as EntityManager).getConnection().execute(
        `SELECT status FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ status: string }>
      expect(avant.status).toBe('DELIVERING')

      await deliveries.deliverRun(fixture.runId, fixture.courierUserId, {
        proofType: 'CODE',
        code: run.confirmation_code,
      })

      const courses = await (em as EntityManager).getConnection().execute(
        `SELECT d.status, o.status AS order_status
         FROM deliveries d JOIN orders o ON o.id = d.order_id
         WHERE d.delivery_run_id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, order_status: string }>
      expect(courses).toHaveLength(2)
      expect(courses.every(row => row.status === 'DELIVERED')).toBe(true)
      expect(courses.every(row => row.order_status === 'DELIVERED')).toBe(true)

      const [apres] = await (em as EntityManager).getConnection().execute(
        `SELECT status, delivered_at FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, delivered_at: string | null }>
      expect(apres.status).toBe('DELIVERED')
      expect(apres.delivered_at).not.toBeNull()
    })

    it('donne au livreur une tournée unique, ses collectes dans l\'ordre', async (context) => {
      const { app } = context
      const fixture = await tourneeAcceptee(context)
      const deliveries = app.get(DeliveriesService)

      const row = await deliveries.getMyActiveRun(fixture.courierUserId)
      expect(row).not.toBeNull()
      const active = DeliveriesMapper.toActiveRun(row!)

      expect(active.shopCount).toBe(2)
      expect(active.courierFee).toBe(720)
      expect(active.stops).toHaveLength(2)
      // The order follows what acceptance decided: closest first.
      expect(active.stops[0].deliveryId).toBe(fixture.deliveryIds[1])
      expect(active.stops.every(stop => stop.status === 'ACCEPTED')).toBe(true)
      expect(active.stops[0].shopName).toBeTruthy()
      expect(active.dropoffAddress).toContain('Cadjehoun')

      // After a pickup, the screen must see progress shop by shop.
      await deliveries.collect(fixture.deliveryIds[1], fixture.courierUserId)
      const apres = DeliveriesMapper.toActiveRun((await deliveries.getMyActiveRun(fixture.courierUserId))!)
      expect(apres.status).toBe('COLLECTING')
      expect(apres.confirmationCode).toMatch(/^\d{4}$/)
      expect(apres.stops.find(stop => stop.deliveryId === fixture.deliveryIds[1])?.status).toBe('PICKED_UP')
      expect(apres.stops.find(stop => stop.deliveryId === fixture.deliveryIds[0])?.status).toBe('ACCEPTED')
    })

    it('donne à l\'acheteur une seule progression pour ses deux commandes', async (context) => {
      const { em, app } = context
      const fixture = await tourneeAcceptee(context)
      const deliveries = app.get(DeliveriesService)
      const orders = app.get(OrdersService)

      const orderIds = await (em as EntityManager).getConnection().execute(
        `SELECT o.id FROM orders o JOIN deliveries d ON d.order_id = o.id WHERE d.delivery_run_id = ?`,
        [fixture.runId],
      ) as Array<{ id: string }>

      const avant = await orders.deliverySummaries(orderIds.map(row => row.id))
      expect(avant.size).toBe(2)
      // Both orders point at the same run, at the same progress: that is
      // what lets the buyer follow one progression rather than two.
      for (const summary of avant.values()) {
        expect(summary.run).toEqual({
          id: fixture.runId,
          shopCount: 2,
          collectedCount: 0,
          awaitingBuyerDecision: false,
        })
      }

      await deliveries.collect(fixture.deliveryIds[0], fixture.courierUserId)
      const apres = await orders.deliverySummaries(orderIds.map(row => row.id))
      for (const summary of apres.values()) {
        expect(summary.run?.collectedCount).toBe(1)
      }
    })

    it('règle le livreur une seule fois, sur le gain de la tournée', async (context) => {
      const { em, app } = context
      const fixture = await tourneeAcceptee(context)
      const deliveries = app.get(DeliveriesService)
      await deliveries.collect(fixture.deliveryIds[0], fixture.courierUserId)
      await deliveries.collect(fixture.deliveryIds[1], fixture.courierUserId)

      const [run] = await (em as EntityManager).getConnection().execute(
        `SELECT confirmation_code FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ confirmation_code: string }>
      const remettre = () => deliveries.deliverRun(fixture.runId, fixture.courierUserId, {
        proofType: 'CODE',
        code: run.confirmation_code,
      })

      await remettre()

      // The earning is the run's (720), not the sum of per-order fees —
      // the orders of a unified cart carry none.
      const gains = await (em as EntityManager).getConnection().execute(
        `SELECT amount FROM wallet_transactions
         WHERE delivery_run_id = ? AND type = 'DELIVERY_EARNING'`,
        [fixture.runId],
      ) as Array<{ amount: string }>
      expect(gains).toHaveLength(1)
      expect(Number(gains[0].amount)).toBe(720)

      // Et la part d'eBio : 800 de frais moins 720 de gain.
      const part = await (em as EntityManager).getConnection().execute(
        `SELECT amount FROM wallet_transactions
         WHERE delivery_run_id = ? AND type = 'PLATFORM_DELIVERY_SHARE'`,
        [fixture.runId],
      ) as Array<{ amount: string }>
      expect(part).toHaveLength(1)
      expect(Number(part[0].amount)).toBe(80)

      // Replaying the handover does not pay twice.
      await remettre().catch(() => undefined)
      const apres = await (em as EntityManager).getConnection().execute(
        `SELECT count(*)::int AS n FROM wallet_transactions
         WHERE delivery_run_id = ? AND type = 'DELIVERY_EARNING'`,
        [fixture.runId],
      ) as Array<{ n: number }>
      expect(apres[0].n).toBe(1)
    })
  })

  describe('quand une boutique défaille', () => {
    it('rend le montant de la commande et l\'écart de frais, une seule fois', async (context) => {
      const { em, app } = context
      const fixture = await seed(em as EntityManager)
      const compensation = app.get(CompensationService)
      const db = (em as EntityManager).getConnection()

      const [order] = await db.execute(
        `SELECT o.id, o.total_amount FROM orders o
         JOIN deliveries d ON d.order_id = o.id
         WHERE d.id = ?`,
        [fixture.deliveryIds[0]],
      ) as Array<{ id: string, total_amount: string }>

      await db.execute(`UPDATE orders SET status = 'CANCELLED' WHERE id = ?`, [order.id])
      const result = await compensation.compensateOrder(order.id, 'rupture de stock')

      expect(result.amount).toBe(Math.round(Number(order.total_amount)))
      expect(result.alreadyDone).toBe(false)
      // One order out of two fell through: the cart is not fully refunded.
      expect(result.checkoutStatus).toBe('PARTIALLY_REFUNDED')

      // A single order refund. The fee adjustment, in contrast, carries
      // the run: that is what keeps it from passing for the refund.
      const credits = await db.execute(
        `SELECT amount FROM wallet_transactions
         WHERE order_id = ? AND type = 'REFUND' AND delivery_run_id IS NULL`,
        [order.id],
      ) as Array<{ amount: string }>
      expect(credits).toHaveLength(1)
      expect(Number(credits[0].amount)).toBe(Math.round(Number(order.total_amount)))

      // The shop leaves the run: only one is left.
      const [run] = await db.execute(
        `SELECT shop_count, jsonb_array_length(supplier_ids) AS shops FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ shop_count: number, shops: number }>
      expect(run.shop_count).toBe(1)
      expect(Number(run.shops)).toBe(1)

      // Replaying does not credit twice.
      const rejeu = await compensation.compensateOrder(order.id, 'rejeu')
      expect(rejeu.alreadyDone).toBe(true)
      const apres = await db.execute(
        `SELECT count(*)::int AS n FROM wallet_transactions
         WHERE order_id = ? AND type = 'REFUND' AND delivery_run_id IS NULL`,
        [order.id],
      ) as Array<{ n: number }>
      expect(apres[0].n).toBe(1)
    })

    it('dégroupe la tournée sans preneur et rediffuse chaque course', async (context) => {
      const { em, app } = context
      const fixture = await seed(em as EntityManager)
      const dispatch = app.get(DispatchService)
      const db = (em as EntityManager).getConnection()

      await dispatch.startRunDispatch(fixture.runId)
      // Push the dispatch opening back by 31 minutes: the cron must then
      // ungroup rather than keep the buyer waiting.
      await db.execute(
        `UPDATE delivery_runs SET dispatch_started_at = NOW() - INTERVAL '31 minutes' WHERE id = ?`,
        [fixture.runId],
      )

      await dispatch.escalateStaleRuns()

      const [run] = await db.execute(
        `SELECT status, outcome, delivery_fee FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, outcome: string, delivery_fee: string }>
      expect(run.status).toBe('CANCELLED')
      // The failure is data: the run is not erased.
      expect(run.outcome).toBe('UNSERVED')

      const courses = await db.execute(
        `SELECT delivery_run_id, status, delivery_fee FROM deliveries WHERE id IN (?, ?)`,
        fixture.deliveryIds,
      ) as Array<{ delivery_run_id: string | null, status: string, delivery_fee: string }>
      expect(courses).toHaveLength(2)
      expect(courses.every(row => row.delivery_run_id === null)).toBe(true)
      expect(courses.every(row => row.status === 'AWAITING_COURIER')).toBe(true)
      // Each delivery takes back its share of the fee, without which it
      // would be payable to nobody.
      expect(courses.every(row => Number(row.delivery_fee) === 400)).toBe(true)
    })

    it('alerte le back-office à 15 minutes sans dégrouper', async (context) => {
      const { em, app } = context
      const fixture = await seed(em as EntityManager)
      const dispatch = app.get(DispatchService)
      const db = (em as EntityManager).getConnection()

      await dispatch.startRunDispatch(fixture.runId)
      await db.execute(
        `UPDATE delivery_runs SET dispatch_started_at = NOW() - INTERVAL '16 minutes' WHERE id = ?`,
        [fixture.runId],
      )

      await dispatch.escalateStaleRuns()

      const [run] = await db.execute(
        `SELECT status, escalated_at FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, escalated_at: string | null }>
      expect(run.status).toBe('ESCALATED')
      expect(run.escalated_at).not.toBeNull()

      // The dispatch goes on: the deliveries stay inside the run.
      const courses = await db.execute(
        `SELECT delivery_run_id FROM deliveries WHERE id IN (?, ?)`,
        fixture.deliveryIds,
      ) as Array<{ delivery_run_id: string | null }>
      expect(courses.every(row => row.delivery_run_id === fixture.runId)).toBe(true)
    })
  })

  describe('panier d\'une seule boutique', () => {
    /**
     * The most frequent case, and the one that must not be made heavier: the
     * unified cart must add nothing to a purchase at a single shop.
     */
    it('suit exactement le même chemin qu\'avant, en une collecte et une remise', async (context) => {
      const { em, app } = context
      const fixture = await seed(em as EntityManager, { shops: 1 })
      const dispatch = app.get(DispatchService)
      const deliveries = app.get(DeliveriesService)
      const db = (em as EntityManager).getConnection()

      await dispatch.startRunDispatch(fixture.runId)
      const run = await deliveries.acceptRun(fixture.runId, fixture.courierUserId)
      expect(run.shopCount).toBe(1)
      expect(run.pickupOrder).toHaveLength(1)

      // A single pickup is enough to put the run on the road.
      await deliveries.collect(fixture.deliveryIds[0], fixture.courierUserId)
      const [apresCollecte] = await db.execute(
        `SELECT status, confirmation_code FROM delivery_runs WHERE id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, confirmation_code: string }>
      expect(apresCollecte.status).toBe('DELIVERING')

      await deliveries.deliverRun(fixture.runId, fixture.courierUserId, {
        proofType: 'CODE',
        code: apresCollecte.confirmation_code,
      })

      const [course] = await db.execute(
        `SELECT d.status, o.status AS order_status FROM deliveries d
         JOIN orders o ON o.id = d.order_id WHERE d.delivery_run_id = ?`,
        [fixture.runId],
      ) as Array<{ status: string, order_status: string }>
      expect(course.status).toBe('DELIVERED')
      expect(course.order_status).toBe('DELIVERED')

      // The courier gets the whole fee: one shop, one ride.
      const gains = await db.execute(
        `SELECT amount FROM wallet_transactions
         WHERE delivery_run_id = ? AND type = 'DELIVERY_EARNING'`,
        [fixture.runId],
      ) as Array<{ amount: string }>
      expect(gains).toHaveLength(1)
      expect(Number(gains[0].amount)).toBe(720)
    })
  })
})
