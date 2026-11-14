import type { INestApplication } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { WalletTransactionType } from '../../wallet/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { FamilyHistoryMapper } from '../family-history.mapper'
import { FamilyMemberViewService } from '../family-member-view.service'
import { FamilyMembersService } from '../family-members.service'
import { FamilyWalletModule } from '../family-wallet.module'
import { FamilyWalletsService } from '../family-wallets.service'

const MAMAN_PHONE = '+2290197000001'
const TATA_PHONE = '+2290196000002'
const SECRET_ADDRESS = 'Cadjèhoun, rue après la pharmacie, portail bleu'

/** Every key of a JSON value, however deep. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(keysOf)
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)])
  }
  return []
}

/** What crosses the wire: dates as strings, undefined dropped. */
function wire(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

/**
 * A family with two members; Maman bought tomatoes delivered to her door.
 * Returns what the tests read back.
 */
async function arrange(app: INestApplication, em: EntityManager) {
  const db = em.getConnection()
  const payer = await createUserData(em, { name: 'Awa Diallo' })
  const mamanUser = await createUserData(em, { name: 'Afiavi Kossou', phone: MAMAN_PHONE, phoneVerifiedAt: new Date() })
  const tataUser = await createUserData(em, { name: 'Rose Agbo', phone: TATA_PHONE, phoneVerifiedAt: new Date() })
  const shopUser = await createUserData(em, { name: 'Tori Ferme' })

  const familyWallet = await app.get(FamilyWalletsService).open(payer.id)
  const members = app.get(FamilyMembersService)
  const maman = await members.add(payer.id, { relative: { nickname: 'Maman', name: 'Afiavi Kossou', phone: MAMAN_PHONE, address: null, latitude: null, longitude: null } })
  const tata = await members.add(payer.id, { relative: { nickname: 'Tata', name: 'Rose Agbo', phone: TATA_PHONE, address: null, latitude: null, longitude: null } })

  const [category] = await db.execute(
    `INSERT INTO categories (name, slug, "createdAt", "updatedAt") VALUES ('Légumes', ?, NOW(), NOW()) RETURNING id`,
    [`legumes-${Date.now()}`],
  ) as Array<{ id: string }>
  await app.get(FamilyWalletsService).updateDefaults(payer.id, { defaults: { monthlyCap: 15_000, categoryIds: [category.id] } })

  const [shop] = await db.execute(
    `INSERT INTO suppliers (user_id, shop_name, type, mode, validation_status, location, "createdAt", "updatedAt")
     VALUES (?, 'Ferme Bio Tori', 'TRANSFORMER', 'ORDER', 'VALIDATED', ST_SetSRID(ST_MakePoint(2.39, 6.36), 4326)::geography, NOW(), NOW())
     RETURNING id`,
    [shopUser.id],
  ) as Array<{ id: string }>
  const [product] = await db.execute(
    `INSERT INTO products (supplier_id, category_id, name, price_per_unit, unit, stock, status, "createdAt", "updatedAt")
     VALUES (?, ?, 'Tomates', 3400, 'KG', 50, 'ACTIVE', NOW(), NOW()) RETURNING id`,
    [shop.id, category.id],
  ) as Array<{ id: string }>
  const [checkout] = await db.execute(
    `INSERT INTO checkouts (buyer_id, total_amount, items_total, delivery_fee, payment_method, family_member_id,
                            delivery_mode, delivery_address, delivery_latitude, delivery_longitude, "createdAt", "updatedAt")
     VALUES (?, 6800, 6800, 0, 'FAMILY_WALLET', ?, 'DELIVERY', ?, 6.3576, 2.3912, NOW(), NOW())
     RETURNING id`,
    [mamanUser.id, maman.id, SECRET_ADDRESS],
  ) as Array<{ id: string }>
  const [order] = await db.execute(
    `INSERT INTO orders (order_number, buyer_id, supplier_id, checkout_id, pickup_mode, payment_method, status,
                         total_amount, delivery_address, delivery_latitude, delivery_longitude, "createdAt", "updatedAt")
     VALUES ('EB-FAM-001', ?, ?, ?, 'DELIVERY', 'FAMILY_WALLET', 'PLACED', 6800, ?, 6.3576, 2.3912, NOW(), NOW())
     RETURNING id`,
    [mamanUser.id, shop.id, checkout.id, SECRET_ADDRESS],
  ) as Array<{ id: string }>
  await db.execute(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price) VALUES (?, ?, 2, 3400, 6800)`,
    [order.id, product.id],
  )

  const walletService = app.get(WalletService)
  const balanceRow = await app.get(FamilyWalletsService).balanceWallet(familyWallet.id)
  await walletService.credit(balanceRow.id, { type: WalletTransactionType.TOPUP, amount: 30_000, description: 'Recharge' })
  await walletService.debit(balanceRow.id, { type: WalletTransactionType.ORDER_PAYMENT, amount: 6_800, description: 'Commande EB-FAM-001', orderId: order.id, familyMemberId: maman.id })
  await walletService.debit(balanceRow.id, { type: WalletTransactionType.ORDER_PAYMENT, amount: 2_000, description: 'Commande', familyMemberId: tata.id })

  em.clear()
  return { payer, mamanUser, tataUser, maman, tata }
}

/**
 * US4: the payer follows every purchase without seeing where or what was
 * said; a member sees what they may spend and their own purchases, never
 * the balance nor the others' (FR-025, FR-027).
 */
describe('portefeuille famille, vie privée de l\'historique (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, FamilyWalletModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('montre au payeur le membre, la boutique et les produits, jamais l\'adresse ni le message', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, maman } = await arrange(app, em)

    const page = await app.get(FamilyWalletsService).transactions(payer.id, { page: 1, limit: 20 })
    const body = wire(FamilyHistoryMapper.toTransactionList(page))

    expect(body).toMatchObject({ total: 3 })
    const purchase = (body as { items: Array<Record<string, unknown>> }).items.find(item => (item.order as { orderNumber?: string } | undefined)?.orderNumber === 'EB-FAM-001')
    expect(purchase).toMatchObject({
      type: 'ORDER_PAYMENT',
      amount: -6_800,
      member: { id: maman.id, nickname: 'Maman' },
      order: { shopName: 'Ferme Bio Tori', lines: [{ name: 'Tomates', quantity: 2, imageUrl: null }] },
    })
    const keys = keysOf(body).map(key => key.toLowerCase())
    expect(keys.some(key => key.includes('address') || key.includes('latitude') || key.includes('longitude') || key.includes('message') || key.includes('note'))).toBe(false)
    expect(JSON.stringify(body)).not.toContain('Cadjèhoun')
  })

  it('filtre l\'historique sur un membre exact, et refuse le membre d\'un autre payeur', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { payer, maman, tata } = await arrange(app, em)
    const other = await createUserData(em, { name: 'Koffi Mensah' })
    await app.get(FamilyWalletsService).open(other.id)
    const service = app.get(FamilyWalletsService)

    const mamanOnly = await service.transactions(payer.id, { memberId: maman.id, page: 1, limit: 20 })
    const tataOnly = await service.transactions(payer.id, { memberId: tata.id, page: 1, limit: 20 })

    expect(mamanOnly.total).toBe(1)
    expect(mamanOnly.entries.map(entry => entry.member?.id)).toEqual([maman.id])
    expect(tataOnly.entries.map(entry => Number(entry.transaction.amount))).toEqual([-2_000])
    await expect(service.transactions(other.id, { memberId: maman.id, page: 1, limit: 20 })).rejects.toMatchObject({ status: 404 })
  })

  it('montre au membre son dépensable et ses limites, jamais le solde total', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { mamanUser, maman } = await arrange(app, em)

    const wallets = await app.get(FamilyMemberViewService).mine(mamanUser.id)
    const body = wire(wallets.map(FamilyHistoryMapper.toMemberWallet))

    expect(body).toEqual([{
      memberId: maman.id,
      payerFirstName: 'Awa',
      status: 'ACTIVE',
      // 15 000 cap − 6 800 spent; the balance (21 200) is larger.
      spendable: 8_200,
      limits: { monthlyCap: 15_000, orderMax: null, categoryNames: ['Légumes'] },
      spentThisMonth: 6_800,
    }])
    expect(keysOf(body).some(key => key.toLowerCase().includes('balance'))).toBe(false)
  })

  it('montre au membre ses seuls achats, sans le solde après chaque ligne', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const { mamanUser, tataUser, maman, tata } = await arrange(app, em)
    const view = app.get(FamilyMemberViewService)

    const page = await view.transactions(mamanUser.id, maman.id, 1, 20)
    const body = wire(FamilyHistoryMapper.toMemberTransactionList(page)) as { items: Array<Record<string, unknown>>, total: number }

    expect(body.total).toBe(1)
    expect(body.items[0]).toMatchObject({ type: 'ORDER_PAYMENT', amount: -6_800, order: { orderNumber: 'EB-FAM-001' } })
    expect(keysOf(body).some(key => key.toLowerCase().includes('balance'))).toBe(false)
    expect(keysOf(body)).not.toContain('member')
    // Someone else's access is not theirs to read.
    await expect(view.transactions(tataUser.id, maman.id, 1, 20)).rejects.toMatchObject({ status: 404 })
    expect((await view.transactions(tataUser.id, tata.id, 1, 20)).total).toBe(1)
  })
})
