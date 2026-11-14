import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import type { ExportProfileInput } from '../contracts/terroir.contract'
import { randomBytes } from 'node:crypto'
import { vi } from 'vitest'
import { SmsService } from '../../../common/sms.service'
import { createUserData } from '../../../factories/user.factory'
import { User } from '../../auth/auth.entity'
import { EmailService } from '../../email/email.service'
import { Checkout, CheckoutDeliveryMode, CheckoutStatus } from '../../payments/entities/checkout.entity'
import { ExportReception, ExportShipmentStatus, ExportStorage } from '../contracts/terroir.contract'
import { ExportDeparture } from '../entities/export-departure.entity'
import { ExportPickupPoint } from '../entities/export-pickup-point.entity'
import { ExportShipment } from '../entities/export-shipment.entity'

/** The `code` and status of a refusal. */
export async function refusalOf(promise: Promise<unknown>): Promise<{ status: number, code: unknown }> {
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

/** Mutes the SMS gateway and the mail transport: tests must not wait on either. */
export function muteOutbound(app: INestApplication): void {
  vi.spyOn(app.get(SmsService), 'send').mockResolvedValue(undefined)
  vi.spyOn(app.get(EmailService), 'sendEmail').mockResolvedValue(undefined)
  vi.spyOn(app.get(EmailService), 'sendTemplatedEmail').mockResolvedValue(undefined)
}

/**
 * France and Belgium, as the migration seeds them. The test schema is built
 * from the entities: the rows have to be written by hand.
 */
export async function seedExportCountries(em: EntityManager): Promise<void> {
  await em.getConnection().execute(
    `INSERT INTO export_countries (code, name, to_phrase, in_phrase, display_currency, sort_order, is_active, created_at, updated_at)
     VALUES ('FR', 'France', 'vers la France', 'en France', 'EUR', 10, true, NOW(), NOW()),
            ('BE', 'Belgique', 'vers la Belgique', 'en Belgique', 'EUR', 20, true, NOW(), NOW())
     ON CONFLICT (code) DO NOTHING`,
  )
}

/** A day `days` from now, `YYYY-MM-DD`. */
export function dayFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

/** An instant `days` from now, ISO. */
export function instantFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

export interface ShopFixture {
  supplierId: string
  shopUserId: string
  categoryId: string
  productIds: string[]
}

/**
 * An export profile meeting every criterion (with the seeded products'
 * ingredients and the default settings): exportable as soon as it is saved.
 */
export function completeExportProfile(overrides: Partial<ExportProfileInput> = {}): ExportProfileInput {
  return {
    packedWeightG: 280,
    lengthCm: 10,
    widthCm: 8,
    heightCm: 6,
    shelfLifeDays: 365,
    storage: ExportStorage.AMBIENT,
    allergens: null,
    noAllergens: true,
    origin: { producer: 'Coopérative des femmes de Savè', place: 'Savè, Collines', year: 2026, method: 'Barattage à la main', photos: [] },
    labelPhoto: 'https://media.ebio.app/products/etiquette.jpg',
    declaresFrenchLabel: true,
    declaresDatesPrinted: true,
    declaresSealedPackaging: true,
    ...overrides,
  }
}

/** A validated shop with products priced 3 000, 2 500 and 1 500 FCFA, ingredients filled. */
export async function seedShop(em: EntityManager, shopName = 'Karité Fatou'): Promise<ShopFixture> {
  const db = em.getConnection()
  const userId = (await createUserData(em, { name: shopName })).id

  const [shop] = await db.execute(
    `INSERT INTO suppliers (user_id, shop_name, type, mode, validation_status, location, "createdAt", "updatedAt")
     VALUES (?, ?, 'TRANSFORMER', 'ORDER', 'VALIDATED', ST_SetSRID(ST_MakePoint(2.4264, 6.3616), 4326)::geography, NOW(), NOW())
     RETURNING id`,
    [userId, shopName],
  ) as Array<{ id: string }>
  const [category] = await db.execute(
    `INSERT INTO categories (name, slug, "createdAt", "updatedAt") VALUES ('Épicerie', ?, NOW(), NOW()) RETURNING id`,
    [`epicerie-${randomBytes(4).toString('hex')}`],
  ) as Array<{ id: string }>
  const productIds: string[] = []
  for (const [name, price] of [['Beurre de karité', 3000], ['Moringa 100 g', 2500], ['Gari fin', 1500]] as const) {
    const [product] = await db.execute(
      `INSERT INTO products (supplier_id, category_id, name, price_per_unit, unit, stock, status, ingredients, "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 'PIECE', 50, 'ACTIVE', ?, NOW(), NOW()) RETURNING id`,
      [shop.id, category.id, `${name}, ${shopName}`, price, name],
    ) as Array<{ id: string }>
    productIds.push(product.id)
  }
  return { supplierId: shop.id, shopUserId: userId, categoryId: category.id, productIds }
}

/** A paid terroir parcel on a departure, frozen at the given price. */
export async function seedShipment(em: EntityManager, input: {
  buyerId: string
  departureId: string
  pickupPointId: string
  country: string
  estimatedWeightG: number
  shippingPrice: number
  pricePerKg: number
  minBilledKg: number
  status?: ExportShipmentStatus
}): Promise<string> {
  const checkout = em.create(Checkout, {
    buyer: em.getReference(User, input.buyerId),
    totalAmount: input.shippingPrice + 5000,
    itemsTotal: 5000,
    paymentMethod: 'WALLET',
    status: CheckoutStatus.PAID,
    deliveryMode: CheckoutDeliveryMode.EXPORT,
  })
  const shipment = em.create(ExportShipment, {
    checkout,
    buyer: em.getReference(User, input.buyerId),
    departure: em.getReference(ExportDeparture, input.departureId),
    country: input.country,
    reception: ExportReception.PICKUP,
    pickupPoint: em.getReference(ExportPickupPoint, input.pickupPointId),
    estimatedWeightG: input.estimatedWeightG,
    pricePerKg: String(input.pricePerKg),
    minBilledKg: String(input.minBilledKg),
    shippingPrice: String(input.shippingPrice),
    declaredValue: '5000',
    status: input.status ?? ExportShipmentStatus.PAID,
    trackingToken: randomBytes(12).toString('hex'),
  })
  await em.flush()
  return shipment.id
}
