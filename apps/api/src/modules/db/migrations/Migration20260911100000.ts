import { Migration } from '@mikro-orm/migrations'

const WALLET_TRANSACTION_TYPES = [
  'TOPUP',
  'ORDER_PAYMENT',
  'SALE_CREDIT',
  'COMMISSION_DEBIT',
  'WITHDRAWAL',
  'WITHDRAWAL_REFUND',
  'REFUND',
  'ADJUSTMENT',
  'PROMO_COMPENSATION',
  'DELIVERY_EARNING',
  'DELIVERY_COMMISSION',
  'TIP_PAYMENT',
  'TIP_EARNING',
  'DELIVERY_SPONSORSHIP',
  'BANNER_PAYMENT',
  'BANNER_REFUND',
  'PLATFORM_COMMISSION',
  'PLATFORM_DELIVERY_SHARE',
  'PLATFORM_BANNER',
  'PLATFORM_MARKETING',
]

const PLATFORM_ACCOUNTS = ['SALES_COMMISSION', 'DELIVERY_COMMISSION', 'BANNERS', 'MARKETING']

/**
 * eBio's own books: one wallet per revenue stream, credited as the money is
 * earned instead of being recomputed from history. Opening balances are
 * seeded from what the platform has already earned so the figures mean
 * something from day one.
 */
export class Migration20260911100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "platform_account" varchar(32) NULL;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "wallets_platform_account_unique" ON "wallets" ("platform_account") WHERE "platform_account" IS NOT NULL;`)
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallet_single_owner";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallet_single_owner"
      CHECK (num_nonnulls("user_id", "supplier_id", "courier_profile_id", "platform_account") = 1);`)

    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check"
      CHECK ("type" IN (${WALLET_TRANSACTION_TYPES.map(t => `'${t}'`).join(', ')}));`)

    // Opening balances, from the flows that were already settled.
    this.addSql(`INSERT INTO "wallets" ("id", "platform_account", "balance", "createdAt", "updatedAt")
      SELECT gen_random_uuid(), v.account, v.balance, NOW(), NOW()
      FROM (VALUES
        ('SALES_COMMISSION', (SELECT COALESCE(SUM(commission_amount), 0)::numeric(12,2) FROM "orders" WHERE status = 'DELIVERED')),
        ('DELIVERY_COMMISSION', (SELECT COALESCE(SUM(GREATEST(delivery_fee - courier_fee, 0)), 0)::numeric(12,2) FROM "deliveries" WHERE status = 'DELIVERED' AND courier_id IS NOT NULL)),
        ('BANNERS', (SELECT COALESCE(SUM(-amount), 0)::numeric(12,2) FROM "wallet_transactions" WHERE type IN ('BANNER_PAYMENT', 'BANNER_REFUND'))),
        ('MARKETING', (SELECT COALESCE(SUM(-amount), 0)::numeric(12,2) FROM "wallet_transactions" WHERE type = 'PROMO_COMPENSATION'))
      ) AS v(account, balance)
      WHERE NOT EXISTS (SELECT 1 FROM "wallets" w WHERE w.platform_account = v.account);`)

    this.addSql(`INSERT INTO "wallet_transactions" ("id", "wallet_id", "type", "amount", "balance_after", "description", "createdAt")
      SELECT gen_random_uuid(), w.id, 'ADJUSTMENT', w.balance, w.balance, 'Solde d''ouverture — reprise de l''historique', NOW()
      FROM "wallets" w
      WHERE w.platform_account IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "wallet_transactions" t WHERE t.wallet_id = w.id);`)
  }

  override async down(): Promise<void> {
    this.addSql(`DELETE FROM "wallet_transactions" WHERE "wallet_id" IN (SELECT id FROM "wallets" WHERE "platform_account" IN (${PLATFORM_ACCOUNTS.map(a => `'${a}'`).join(', ')}));`)
    this.addSql(`DELETE FROM "wallets" WHERE "platform_account" IS NOT NULL;`)
    this.addSql(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "wallet_single_owner";`)
    this.addSql(`ALTER TABLE "wallets" ADD CONSTRAINT "wallet_single_owner"
      CHECK (num_nonnulls("user_id", "supplier_id", "courier_profile_id") = 1);`)
    this.addSql(`ALTER TABLE "wallets" DROP COLUMN IF EXISTS "platform_account";`)
  }
}
