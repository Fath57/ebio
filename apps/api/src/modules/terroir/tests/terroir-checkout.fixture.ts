import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import type { TerroirCheckoutInput } from '../contracts/terroir.contract'
import { EntityManager as NestEntityManager } from '@mikro-orm/postgresql'
import { vi } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { PaymentGatewayFactory } from '../../payments/gateways/payment-gateway.factory'
import { PlatformSettingsService } from '../../settings/platform-settings.service'
import { WalletTransactionType } from '../../wallet/entities/wallet-transaction.entity'
import { PlatformAccount } from '../../wallet/entities/wallet.entity'
import { WalletService } from '../../wallet/wallet.service'
import { ExportReception } from '../contracts/terroir.contract'
import { ExportCatalogService } from '../export-catalog.service'
import { ExportLogisticsService } from '../export-logistics.service'
import { completeExportProfile, dayFromNow, instantFromNow, muteOutbound, seedExportCountries, seedShop } from './terroir.fixture'

export interface TerroirWorld {
  agentId: string
  buyerId: string
  /** Karité Fatou: 3 000, 2 500, 1 500 FCFA. */
  shopA: { supplierId: string, productIds: string[] }
  /** Moringa Bio: same prices. */
  shopB: { supplierId: string, productIds: string[] }
  agencyId: string
  parisId: string
  bruxellesId: string
  departureId: string
}

/**
 * Makes a product exportable at `weightG` per unit, with an origin (badge):
 * a profile meeting every criterion, exportable at once (no review).
 */
export async function approveForExport(app: INestApplication, supplierId: string, productId: string, _agentId: string, weightG: number): Promise<void> {
  await app.get(ExportCatalogService).upsertProfile(supplierId, productId, completeExportProfile({
    packedWeightG: weightG,
    origin: { producer: 'Coopérative de Savè', place: 'Savè', photos: [] },
  }))
}

export async function seedDeparture(app: INestApplication, agentId: string, agencyId: string, overrides: { capacityKg?: number | null, beHomeFee?: number | null } = {}): Promise<string> {
  const view = await app.get(ExportLogisticsService).createDeparture({
    agencyId,
    departsOn: dayFromNow(10),
    depositDeadline: instantFromNow(8),
    transitMinDays: 7,
    transitMaxDays: 11,
    capacityKg: overrides.capacityKg === undefined ? 100 : overrides.capacityKg,
    rates: [
      { country: 'FR', pricePerKg: 8500, minBilledKg: 5, maxWeightKg: 30, homeDeliveryFee: 3900 },
      { country: 'BE', pricePerKg: 9000, minBilledKg: 5, homeDeliveryFee: overrides.beHomeFee ?? null },
    ],
  }, agentId)
  return view.departure.id
}

/**
 * Two shops with exportable products (280 g, 120 g, 500 g), an agency with
 * a pickup point in Paris and Brussels, an open departure (FR 8 500/kg, 5 kg
 * minimum, door delivery 3 900; BE 9 000/kg, no door delivery), the module
 * open, and a verified buyer with `balance` FCFA in their wallet.
 */
export async function seedTerroirWorld(app: INestApplication, em: EntityManager, options: { balance?: number, capacityKg?: number | null } = {}): Promise<TerroirWorld> {
  muteOutbound(app)
  // Read on every order, backed by no entity: the test schema lacks it.
  await em.getConnection().execute(`CREATE TABLE IF NOT EXISTS "commission_rates" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "category_slug" varchar(50) NOT NULL UNIQUE,
    "rate" float NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT NOW(),
    "updated_at" timestamptz NOT NULL DEFAULT NOW(),
    CONSTRAINT "commission_rates_pkey" PRIMARY KEY ("id")
  );`)
  await seedExportCountries(em)
  await app.get(PlatformSettingsService).setTerroirExportSettings({ enabled: true })
  const agent = await createUserData(em, { name: 'Agent eBio' })
  const buyer = await createUserData(em, { name: 'Awa Diallo' })
  const shopA = await seedShop(em, 'Karité Fatou')
  const shopB = await seedShop(em, 'Moringa Bio')
  for (const shop of [shopA, shopB]) {
    for (const [index, weightG] of [280, 120, 500].entries()) {
      await approveForExport(app, shop.supplierId, shop.productIds[index], agent.id, weightG)
    }
  }

  const logistics = app.get(ExportLogisticsService)
  const agency = await logistics.createAgency({ name: 'Bénin Express' }, agent.id)
  const paris = await logistics.createPickupPoint(agency.id, { country: 'FR', city: 'Paris', address: '12 rue Myrha, 75018 Paris', openingHours: 'mar.–sam. 10 h–19 h' }, agent.id)
  const bruxelles = await logistics.createPickupPoint(agency.id, { country: 'BE', city: 'Bruxelles', address: '4 chaussée d\'Ixelles, 1050 Ixelles' }, agent.id)
  const departureId = await seedDeparture(app, agent.id, agency.id, { capacityKg: options.capacityKg })

  if (options.balance) {
    await topUp(app, buyer.id, options.balance)
  }
  em.clear()
  app.get(NestEntityManager).clear()
  return {
    agentId: agent.id,
    buyerId: buyer.id,
    shopA: { supplierId: shopA.supplierId, productIds: shopA.productIds },
    shopB: { supplierId: shopB.supplierId, productIds: shopB.productIds },
    agencyId: agency.id,
    parisId: paris.id,
    bruxellesId: bruxelles.id,
    departureId,
  }
}

export async function topUp(app: INestApplication, userId: string, amount: number): Promise<void> {
  const wallets = app.get(WalletService)
  const wallet = await wallets.getOrCreate({ userId })
  await wallets.credit(wallet.id, { type: WalletTransactionType.TOPUP, amount, description: 'Recharge' })
}

/** A checkout input with the defaults the contract would fill. */
export function terroirCart(lines: TerroirCheckoutInput['lines'], overrides: Partial<TerroirCheckoutInput> = {}): TerroirCheckoutInput {
  return {
    country: 'FR',
    lines,
    reception: ExportReception.PICKUP,
    insured: false,
    paymentMethod: 'WALLET',
    displayCurrency: 'XOF',
    ...overrides,
  }
}

export async function balanceOfUser(em: EntityManager, userId: string): Promise<number> {
  const [row] = await em.getConnection().execute(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]) as Array<{ balance: string }>
  return row ? Number(row.balance) : 0
}

export async function balanceOfShop(em: EntityManager, supplierId: string): Promise<number> {
  const [row] = await em.getConnection().execute(`SELECT balance FROM wallets WHERE supplier_id = ?`, [supplierId]) as Array<{ balance: string }>
  return row ? Number(row.balance) : 0
}

export async function exportMovements(em: EntityManager): Promise<Array<{ type: string, amount: number }>> {
  const rows = await em.getConnection().execute(
    `SELECT t.type, t.amount FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
     WHERE w.platform_account = ? ORDER BY t."createdAt" ASC`,
    [PlatformAccount.EXPORT],
  ) as Array<{ type: string, amount: string }>
  return rows.map(row => ({ type: row.type, amount: Number(row.amount) }))
}

/**
 * A card gateway that hands over a hosted page and confirms whatever is asked
 * at `paidAmount` (the checkout total when omitted at check time).
 */
export function fakeCardGateway(app: INestApplication, status: { paidAmount?: number } = {}): void {
  const gateway = {
    hostsPaymentPage: () => true,
    initiatePayment: async () => ({ providerTransactionId: `intram-${Math.random().toString(36).slice(2, 10)}`, redirectUrl: 'https://pay.example/terroir' }),
    checkStatus: async () => ({ status: 'completed', amount: status.paidAmount, reference: 'REF-1', paidAt: new Date() }),
  }
  vi.spyOn(app.get(PaymentGatewayFactory), 'createGateway').mockReturnValue(gateway as never)
}
