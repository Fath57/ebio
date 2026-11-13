import type { INestApplication } from '@nestjs/common'
import type { CheckoutService } from '../../orders/checkout.service'
import { EntityManager } from '@mikro-orm/postgresql'
import { vi } from 'vitest'
import { SmsService } from '../../../common/sms.service'
import { createUserData } from '../../../factories/user.factory'
import { EmailService } from '../../email/email.service'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { WalletTransactionType } from '../../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { FamilyMembersService } from '../family-members.service'
import { FamilyWalletsService } from '../family-wallets.service'

/**
 * A payer, their family wallet funded, relatives with verified accounts as
 * active members, and a shop selling products in a category — what the
 * family wallet payment tests start from.
 */

export const MAMAN_PHONE = '+2290197000001'
export const TATA_PHONE = '+2290196000002'

const BOUTIQUE = { latitude: 6.3616, longitude: 2.4264 }

export interface FamilyMemberFixture {
  userId: string
  memberId: string
}

export interface FamilyFixture {
  payerId: string
  familyWalletId: string
  balanceWalletId: string
  maman: FamilyMemberFixture
  tata: FamilyMemberFixture
  categoryId: string
  otherCategoryId: string
  /** Two products at the given price, same shop, same category. */
  productIds: [string, string]
}

/** The `code` and body of a refusal. */
export async function refusalOf(promise: Promise<unknown>): Promise<{ status: number, body: Record<string, unknown> }> {
  try {
    await promise
  }
  catch (error) {
    const typed = error as { getStatus?: () => number, getResponse?: () => unknown }
    const body = typed.getResponse?.()
    return {
      status: typed.getStatus?.() ?? 0,
      body: typeof body === 'object' && body !== null ? body as Record<string, unknown> : { message: String(error) },
    }
  }
  throw new Error('L\'opération aurait dû être refusée')
}

/** Mutes the SMS gateway and the mail transport: tests must not wait on either. */
export function muteOutbound(app: INestApplication): void {
  vi.spyOn(app.get(SmsService), 'send').mockResolvedValue(undefined)
  vi.spyOn(app.get(EmailService), 'sendEmail').mockResolvedValue(undefined)
}

async function uniqueCategory(em: EntityManager, name: string): Promise<string> {
  const [category] = await em.getConnection().execute(
    `INSERT INTO categories (name, slug, "createdAt", "updatedAt") VALUES (?, ?, NOW(), NOW()) RETURNING id`,
    [name, `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
  ) as Array<{ id: string }>
  return category.id
}

export async function seedFamily(app: INestApplication, em: EntityManager, options: { balance: number, price: number }): Promise<FamilyFixture> {
  muteOutbound(app)
  await app.get(PlatformSettingsService).setFamilyWalletEnabled(true)

  const payer = await createUserData(em, { name: 'Awa Diallo' })
  const mamanUser = await createUserData(em, { name: 'Afiavi Kossou', phone: MAMAN_PHONE, phoneVerifiedAt: new Date() })
  const tataUser = await createUserData(em, { name: 'Rose Agbo', phone: TATA_PHONE, phoneVerifiedAt: new Date() })
  const shopUser = await createUserData(em)
  const db = em.getConnection()

  // Read on every order, backed by no entity: the test schema lacks it.
  await db.execute(`CREATE TABLE IF NOT EXISTS "commission_rates" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "category_slug" varchar(50) NOT NULL UNIQUE,
    "rate" float NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT NOW(),
    "updated_at" timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
  );`)

  const [shop] = await db.execute(
    `INSERT INTO suppliers (user_id, shop_name, type, mode, validation_status, location, "createdAt", "updatedAt")
     VALUES (?, 'Ferme Bio Tori', 'TRANSFORMER', 'ORDER', 'VALIDATED', ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, NOW(), NOW())
     RETURNING id`,
    [shopUser.id, BOUTIQUE.longitude, BOUTIQUE.latitude],
  ) as Array<{ id: string }>
  const categoryId = await uniqueCategory(em, 'Légumes')
  const otherCategoryId = await uniqueCategory(em, 'Boissons')
  const productIds: string[] = []
  for (const name of ['Tomates fraîches bio', 'Gombo frais']) {
    const [product] = await db.execute(
      `INSERT INTO products (supplier_id, category_id, name, price_per_unit, unit, stock, status, "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 'KG', 500, 'ACTIVE', NOW(), NOW())
       RETURNING id`,
      [shop.id, categoryId, name, options.price],
    ) as Array<{ id: string }>
    productIds.push(product.id)
  }

  const familyWallet = await app.get(FamilyWalletsService).open(payer.id)
  const members = app.get(FamilyMembersService)
  const relative = { name: 'Proche', address: null, latitude: null, longitude: null }
  const maman = await members.add(payer.id, { relative: { ...relative, nickname: 'Maman', phone: MAMAN_PHONE } })
  const tata = await members.add(payer.id, { relative: { ...relative, nickname: 'Tata', phone: TATA_PHONE } })

  const walletService = app.get(WalletService)
  const balanceWallet = await walletService.getOrCreate({ familyWalletId: familyWallet.id })
  if (options.balance > 0) {
    await walletService.credit(balanceWallet.id, { type: WalletTransactionType.TOPUP, amount: options.balance, description: 'Recharge' })
  }
  em.clear()
  app.get(EntityManager).clear()

  return {
    payerId: payer.id,
    familyWalletId: familyWallet.id,
    balanceWalletId: balanceWallet.id,
    maman: { userId: mamanUser.id, memberId: maman.id },
    tata: { userId: tataUser.id, memberId: tata.id },
    categoryId,
    otherCategoryId,
    productIds: [productIds[0], productIds[1]],
  }
}

/** A pickup cart (no delivery fee): `quantity` units of one product, paid by the member. */
export function familyCart(productId: string, memberId: string, quantity = 1, overrides: Record<string, unknown> = {}): Parameters<CheckoutService['create']>[1] {
  return {
    items: [{ productId, quantity }],
    pickupMode: 'ON_SITE',
    paymentMethod: 'FAMILY_WALLET',
    familyMemberId: memberId,
    displayCurrency: 'XOF',
    ...overrides,
  } as Parameters<CheckoutService['create']>[1]
}

export async function balanceOf(em: EntityManager, walletId: string): Promise<number> {
  const [row] = await em.getConnection().execute(`SELECT balance FROM wallets WHERE id = ?`, [walletId]) as Array<{ balance: string }>
  return Number(row.balance)
}

export async function personalBalanceOf(em: EntityManager, userId: string): Promise<number> {
  const [row] = await em.getConnection().execute(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]) as Array<{ balance: string }>
  return row ? Number(row.balance) : 0
}

export async function notificationsOf(em: EntityManager, userId: string, type: string): Promise<Array<{ body: string }>> {
  return await em.getConnection().execute(
    `SELECT body FROM notifications WHERE "userId" = ? AND type = ? ORDER BY "createdAt"`,
    [userId, type],
  ) as Array<{ body: string }>
}
