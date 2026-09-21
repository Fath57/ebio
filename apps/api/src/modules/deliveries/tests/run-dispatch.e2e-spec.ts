import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
/**
 * La diffusion d'une tournée, éprouvée sur une vraie base PostGIS.
 *
 * Ce qui est testé ici ne l'est nulle part ailleurs : les requêtes brutes. Le
 * typecheck ne dit rien d'un `array_position` mal écrit ou d'un `LATERAL` qui
 * ne compile pas côté serveur — il faut les exécuter.
 *
 * Trois questions, dans l'ordre où elles se posent :
 *   1. la tournée trouve-t-elle des livreurs à partir de son point de collecte ?
 *   2. un livreur peut-il la prendre entière, et l'ordre de passage part-il
 *      bien de chez lui ?
 *   3. ses livraisons restent-elles hors de la liste des courses isolées ?
 */
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { OrdersService } from '../../orders/orders.service'
import { DeliveriesMapper } from '../deliveries.mapper'
import { DeliveriesModule } from '../deliveries.module'
import { DeliveriesService } from '../deliveries.service'
import { DispatchService } from '../dispatch.service'

/** Cotonou : deux boutiques voisines, un acheteur un peu plus loin. */
const FATOU = { latitude: 6.3616, longitude: 2.4264 }
const KOFFI = { latitude: 6.3654, longitude: 2.4183 }
const ACHETEUR = { latitude: 6.3700, longitude: 2.4300 }
/** Le livreur est garé à côté de Koffi, pas de Fatou. */
const LIVREUR = { latitude: 6.3660, longitude: 2.4180 }
/** Un second livreur, à l'autre bout de la zone : il doit passer après. */
const LIVREUR_LOIN = { latitude: 6.3900, longitude: 2.4500 }

interface Fixture {
  runId: string
  courierId: string
  courierUserId: string
  farCourierId: string
  deliveryIds: string[]
}

async function seed(em: EntityManager): Promise<Fixture> {
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

  const shops: string[] = []
  for (const [index, shopUser] of [shopUserA, shopUserB].entries()) {
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
     VALUES (?, ?::jsonb, '[]'::jsonb, 800, 720, 2, 0.99, 2.1, NOW(), NOW())
     RETURNING id`,
    [checkout.id, JSON.stringify(shops)],
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
    // Deux connexions : le règlement du livreur ouvre sa propre transaction
    // pendant que la remise tient la sienne.
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      // Deux modules que l'application enregistre globalement et qu'il faut
      // nommer ici : les rôles (pour le garde CASL) et l'audit.
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

    // La distance ne se mesure qu'une fois le point de collecte posé, ce que
    // fait l'ouverture de la diffusion.
    await dispatch.startRunDispatch(fixture.runId)

    const eligible = await dispatch.findEligibleFor(target)
    expect(eligible.map(c => c.id)).toEqual(expect.arrayContaining([fixture.courierId, fixture.farCourierId]))

    // Le proche a déjà été sollicité par l'ouverture : il sort du classement,
    // on ne redemande pas deux fois. Reste l'éloigné, avec sa vraie distance.
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
    // Le livreur est garé à côté de Koffi : c'est par là qu'il commence.
    expect(run.pickupOrder[0]).toBe(fixture.deliveryIds[1])

    const rows = await (em as EntityManager).getConnection().execute(
      `SELECT status, courier_id FROM deliveries WHERE delivery_run_id = ?`,
      [fixture.runId],
    ) as Array<{ status: string, courier_id: string | null }>
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.status === 'ACCEPTED' && row.courier_id === fixture.courierId)).toBe(true)
  })

  it('garde les livraisons d\'une tournée hors de la liste des courses isolées', async (context) => {
    const { em, app } = context
    const fixture = await seed(em as EntityManager)
    const deliveries = app.get(DeliveriesService)
    // Une tournée n'est proposée qu'une fois diffusée : sans cela elle n'est
    // ni ciblée ni en diffusion large, et elle n'a rien à faire dans la liste.
    await app.get(DispatchService).startRunDispatch(fixture.runId)

    const isolees = await deliveries.getOffers(fixture.courierUserId)
    expect(isolees.map(row => row.id)).not.toContain(fixture.deliveryIds[0])

    // Mais la tournée, elle, doit apparaître — avec ses deux collectes.
    const tournees = await deliveries.getRunOffers(fixture.courierUserId)
    const proposee = tournees.find(row => row.id === fixture.runId)
    expect(proposee).toBeDefined()
    expect(proposee?.stops).toHaveLength(2)
    expect(Number(proposee?.courier_earning)).toBe(720)
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
      // L'autre boutique n'a rien vu passer : c'est FR-017.
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
      // Le code ne change pas en cours de route.
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

      // Un code refusé ne laisse rien derrière lui : la tournée roule encore.
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
      // L'ordre suit le passage décidé à l'acceptation : le plus proche d'abord.
      expect(active.stops[0].deliveryId).toBe(fixture.deliveryIds[1])
      expect(active.stops.every(stop => stop.status === 'ACCEPTED')).toBe(true)
      expect(active.stops[0].shopName).toBeTruthy()
      expect(active.dropoffAddress).toContain('Cadjehoun')

      // Après une collecte, l'écran doit voir l'avancement boutique par boutique.
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
      // Les deux commandes pointent la même tournée, au même avancement : c'est
      // ce qui permet à l'acheteur de suivre une progression et non deux.
      for (const summary of avant.values()) {
        expect(summary.run).toEqual({ id: fixture.runId, shopCount: 2, collectedCount: 0 })
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

      // Le gain est celui de la tournée (720), pas la somme de frais par
      // commande — les commandes d'un panier unifié en portent zéro.
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

      // Rejouer la remise ne paie pas deux fois.
      await remettre().catch(() => undefined)
      const apres = await (em as EntityManager).getConnection().execute(
        `SELECT count(*)::int AS n FROM wallet_transactions
         WHERE delivery_run_id = ? AND type = 'DELIVERY_EARNING'`,
        [fixture.runId],
      ) as Array<{ n: number }>
      expect(apres[0].n).toBe(1)
    })
  })
})
