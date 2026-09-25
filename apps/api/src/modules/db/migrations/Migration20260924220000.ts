import { Migration } from '@mikro-orm/migrations'

/**
 * `intram` among the providers the payments table accepts.
 *
 * The constraint predates INTRAM and had never complained: wallet top-ups do
 * not write to `payments`, and that is all we had tried. The first order paid
 * through INTRAM would have failed on insert — after the payment, so with a
 * buyer debited and an order never marked paid.
 *
 * The code enum also carries `stripe` and `pawerpayer`; they are kept so as
 * not to invalidate what exists.
 */
export class Migration20260924220000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_provider_check"')
    this.addSql(`ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_check"
      CHECK (provider = ANY (ARRAY['fedapay'::text, 'stripe'::text, 'pawerpayer'::text, 'intram'::text]))`)
  }

  override async down(): Promise<void> {
    // Rolling back would reject payments already recorded.
  }
}
