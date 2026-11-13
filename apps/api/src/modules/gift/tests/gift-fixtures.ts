import type { EntityManager } from '@mikro-orm/postgresql'
import { createUserData } from '../../../factories/user.factory'

/** Cotonou: the shop, and the relative's door a couple of kilometres away. */
export const BOUTIQUE = { latitude: 6.3616, longitude: 2.4264 }
export const PORTE_DU_PROCHE = { latitude: 6.3576, longitude: 2.3912 }
/** About a kilometre north of the door. */
export const UN_KM_PLUS_LOIN = { latitude: 6.3666, longitude: 2.3912 }

export const RECIPIENT_PHONE = '+2290197000001'
export const HANDOVER_CODE = '4821'

export interface GiftDeliveryFixture {
  buyerId: string
  courierId: string
  courierUserId: string
  otherCourierUserId: string
  checkoutId: string
  orderIds: string[]
  deliveryIds: string[]
  runId: string | null
}

interface SeedOptions {
  /** A cart sent to a relative (default) or an ordinary one. */
  gift?: boolean
  /** Two orders in one run, already on the road. */
  run?: boolean
  orderTotal?: number
  deliveryFee?: number
  courierFee?: number
}

/**
 * A paid cart whose delivery is on the road with its code, as the courier
 * finds it at the door. Written in SQL: what is under test is the hand-over,
 * not the way there.
 */
export async function seedDeliveryInTransit(em: EntityManager, options: SeedOptions = {}): Promise<GiftDeliveryFixture> {
  const gift = options.gift ?? true
  const orderTotal = options.orderTotal ?? 10000
  const deliveryFee = options.deliveryFee ?? 1500
  const courierFee = options.courierFee ?? 1200
  const orderCount = options.run ? 2 : 1

  const buyer = await createUserData(em, { name: 'Awa Diallo', phone: `+3361234${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}` })
  const shopUser = await createUserData(em)
  const courierUser = await createUserData(em, { name: 'Jean Livreur' })
  const otherCourierUser = await createUserData(em, { name: 'Autre Livreur' })
  await em.flush()
  const db = em.getConnection()

  const insertCourier = async (userId: string, phone: string) => {
    const [row] = await db.execute(
      `INSERT INTO courier_profiles (user_id, full_name, phone, vehicle_type, zone, validation_status, is_available, "createdAt", "updatedAt")
       VALUES (?, 'Livreur', ?, 'MOTO', 'Cotonou', 'VALIDATED', true, NOW(), NOW())
       RETURNING id`,
      [userId, phone],
    ) as Array<{ id: string }>
    return row.id
  }
  const courierId = await insertCourier(courierUser.id, `+2299${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`)
  await insertCourier(otherCourierUser.id, `+2299${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`)

  const [shop] = await db.execute(
    `INSERT INTO suppliers (user_id, shop_name, type, mode, validation_status, location, "createdAt", "updatedAt")
     VALUES (?, 'Fruits Fatou', 'TRANSFORMER', 'ORDER', 'VALIDATED', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, NOW(), NOW())
     RETURNING id`,
    [shopUser.id, BOUTIQUE.longitude, BOUTIQUE.latitude],
  ) as Array<{ id: string }>

  const [checkout] = await db.execute(
    `INSERT INTO checkouts (buyer_id, total_amount, items_total, delivery_fee, payment_method, status,
                            delivery_mode, delivery_address, delivery_latitude, delivery_longitude,
                            recipient_name, recipient_phone, tracking_token, recipient_announced_at,
                            "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, 'FEDAPAY', 'PAID', 'DELIVERY', 'Cadjèhoun, portail bleu après la pharmacie', ?, ?,
             ?, ?, ?, ?, NOW(), NOW())
     RETURNING id`,
    [
      buyer.id,
      orderTotal * orderCount,
      (orderTotal - deliveryFee) * orderCount,
      deliveryFee * orderCount,
      PORTE_DU_PROCHE.latitude,
      PORTE_DU_PROCHE.longitude,
      gift ? 'Afiavi Kossou' : null,
      gift ? RECIPIENT_PHONE : null,
      gift ? `tok-${Math.random().toString(36).slice(2, 14)}` : null,
      gift ? new Date() : null,
    ],
  ) as Array<{ id: string }>

  let runId: string | null = null
  if (options.run) {
    const [run] = await db.execute(
      `INSERT INTO delivery_runs (checkout_id, supplier_ids, pickup_order, delivery_fee, courier_earning, shop_count,
                                  courier_id, status, confirmation_code, "createdAt", "updatedAt")
       VALUES (?, ?::jsonb, '[]'::jsonb, ?, ?, 2, ?, 'DELIVERING', ?, NOW(), NOW())
       RETURNING id`,
      [checkout.id, JSON.stringify([shop.id]), deliveryFee, courierFee, courierId, HANDOVER_CODE],
    ) as Array<{ id: string }>
    runId = run.id
  }

  const orderIds: string[] = []
  const deliveryIds: string[] = []
  for (let index = 0; index < orderCount; index++) {
    const [order] = await db.execute(
      `INSERT INTO orders (order_number, buyer_id, supplier_id, checkout_id, pickup_mode, payment_method, status,
                           total_amount, delivery_fee, delivery_address, delivery_latitude, delivery_longitude,
                           "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 'DELIVERY', 'FEDAPAY', 'IN_DELIVERY', ?, ?, 'Cadjèhoun, portail bleu', ?, ?, NOW(), NOW())
       RETURNING id`,
      [
        `EB-GIFT-${Math.random().toString(36).slice(2, 8)}`,
        buyer.id,
        shop.id,
        checkout.id,
        orderTotal,
        deliveryFee,
        PORTE_DU_PROCHE.latitude,
        PORTE_DU_PROCHE.longitude,
      ],
    ) as Array<{ id: string }>
    orderIds.push(order.id)

    await db.execute(
      `INSERT INTO payments (order_id, checkout_id, amount, provider, payment_method, status, paid_at, "createdAt", "updatedAt")
       VALUES (?, ?, ?, 'intram', 'intram_checkout', 'CAPTURED', NOW(), NOW(), NOW())`,
      [order.id, checkout.id, orderTotal],
    )

    const [delivery] = await db.execute(
      `INSERT INTO deliveries (order_id, delivery_run_id, courier_id, pickup_address, dropoff_address,
                               pickup_latitude, pickup_longitude, status, dispatch_phase, delivery_fee, courier_fee,
                               confirmation_code, offered_at, accepted_at, picked_up_at, in_transit_at,
                               "createdAt", "updatedAt")
       VALUES (?, ?, ?, 'Marché Fatou', 'Cadjèhoun', ?, ?, 'IN_TRANSIT', 'BROADCAST', ?, ?, ?,
               NOW() - interval '1 hour', NOW() - interval '50 minutes', NOW() - interval '40 minutes',
               NOW() - interval '30 minutes', NOW(), NOW())
       RETURNING id`,
      [
        order.id,
        runId,
        courierId,
        BOUTIQUE.latitude,
        BOUTIQUE.longitude,
        options.run ? 0 : deliveryFee,
        options.run ? 0 : courierFee,
        HANDOVER_CODE,
      ],
    ) as Array<{ id: string }>
    deliveryIds.push(delivery.id)
  }

  return {
    buyerId: buyer.id,
    courierId,
    courierUserId: courierUser.id,
    otherCourierUserId: otherCourierUser.id,
    checkoutId: checkout.id,
    orderIds,
    deliveryIds,
    runId,
  }
}

/** A hand-over photo row, as the upload leaves it. */
export async function insertProofMedia(em: EntityManager, uploadedBy: string, context = 'DELIVERY_PROOF'): Promise<string> {
  const [media] = await em.getConnection().execute(
    `INSERT INTO media (uploaded_by, type, context, status, original_name, mime_type, original_size, s3_key, s3_bucket, "createdAt", "updatedAt")
     VALUES (?, 'IMAGE', ?, 'READY', 'remise.jpg', 'image/jpeg', 1000, ?, 'test-bucket', NOW(), NOW())
     RETURNING id`,
    [uploadedBy, context, `delivery_proof/${Math.random().toString(36).slice(2)}.jpg`],
  ) as Array<{ id: string }>
  return media.id
}

/** A product line on an order, with a photo: what the tracking page and « Paniers reçus » list. */
export async function addOrderLine(em: EntityManager, orderId: string, name = 'Tomates fraîches bio', quantity = 2): Promise<string> {
  const db = em.getConnection()
  const [order] = await db.execute(`SELECT supplier_id FROM orders WHERE id = ?`, [orderId]) as Array<{ supplier_id: string }>
  const [category] = await db.execute(
    `INSERT INTO categories (name, slug, "createdAt", "updatedAt") VALUES ('Légumes', ?, NOW(), NOW()) RETURNING id`,
    [`legumes-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  ) as Array<{ id: string }>
  const [product] = await db.execute(
    `INSERT INTO products (supplier_id, category_id, name, price_per_unit, unit, stock, status, photos, "createdAt", "updatedAt")
     VALUES (?, ?, ?, 1200, 'KG', 50, 'ACTIVE', ?::jsonb, NOW(), NOW())
     RETURNING id`,
    [order.supplier_id, category.id, name, JSON.stringify(['https://cdn.ebio.test/tomates.opt.webp'])],
  ) as Array<{ id: string }>
  await db.execute(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, 1200, ?)`,
    [orderId, product.id, quantity, 1200 * quantity],
  )
  return product.id
}
