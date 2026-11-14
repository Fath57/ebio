import { Migration } from '@mikro-orm/migrations'

/** Every wallet movement type, in full: the CHECK is rebuilt, never patched. */
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
  'REFERRAL_REWARD',
  'PLATFORM_COMMISSION',
  'PLATFORM_DELIVERY_SHARE',
  'PLATFORM_BANNER',
  'PLATFORM_MARKETING',
  'FAMILY_TRANSFER_OUT',
  'FAMILY_TRANSFER_IN',
  'FAMILY_CLOSURE_OUT',
  'FAMILY_CLOSURE_IN',
  'EXPORT_SHIPPING_INCOME',
  'EXPORT_INSURANCE_INCOME',
  'EXPORT_LOSS',
  'EXPORT_PACK_COMPENSATION',
  'EXPORT_COLLECTION_COST',
]

const DELIVERY_PURPOSES = ['STANDARD', 'EXPORT_COLLECTION']

function quoteList(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ')
}

/**
 * 011: eBio couriers bring the terroir orders from the shops to the eBio
 * consolidation point. A delivery gets a purpose (STANDARD or
 * EXPORT_COLLECTION), the parcel it feeds, the hub's snapshot and its
 * drop-off point; the hub's code takes 6 digits; the courier's earning is
 * booked on the EXPORT account as EXPORT_COLLECTION_COST.
 * Idempotent: replayed by the prod SQL script.
 */
export class Migration20261122090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "purpose" varchar(20) NOT NULL DEFAULT 'STANDARD';`)
    this.addSql(`ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "export_shipment_id" uuid NULL;`)
    this.addSql(`ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "export_hub" jsonb NULL;`)
    this.addSql(`ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "dropoff_latitude" double precision NULL;`)
    this.addSql(`ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "dropoff_longitude" double precision NULL;`)
    this.addSql(`ALTER TABLE "deliveries" ALTER COLUMN "confirmation_code" TYPE varchar(6);`)

    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_purpose_check";`)
    this.addSql(`ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_purpose_check" CHECK ("purpose" IN (${quoteList(DELIVERY_PURPOSES)}));`)
    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_export_collection_check";`)
    this.addSql(`ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_export_collection_check" CHECK (("purpose" = 'EXPORT_COLLECTION') = ("export_shipment_id" IS NOT NULL));`)
    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_export_shipment_id_foreign";`)
    this.addSql(`ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_export_shipment_id_foreign" FOREIGN KEY ("export_shipment_id") REFERENCES "export_shipments" ("id") ON UPDATE CASCADE;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "deliveries_export_shipment_id_index" ON "deliveries" ("export_shipment_id");`)

    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (${quoteList(WALLET_TRANSACTION_TYPES)}));`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_type_check";`)
    this.addSql(`ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN (${quoteList(WALLET_TRANSACTION_TYPES.filter(type => type !== 'EXPORT_COLLECTION_COST'))}));`)
    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_export_shipment_id_foreign";`)
    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_export_collection_check";`)
    this.addSql(`ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_purpose_check";`)
    this.addSql(`DROP INDEX IF EXISTS "deliveries_export_shipment_id_index";`)
    this.addSql(`ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "dropoff_longitude";`)
    this.addSql(`ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "dropoff_latitude";`)
    this.addSql(`ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "export_hub";`)
    this.addSql(`ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "export_shipment_id";`)
    this.addSql(`ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "purpose";`)
  }
}
