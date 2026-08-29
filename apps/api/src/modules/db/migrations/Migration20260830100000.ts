import { Migration } from '@mikro-orm/migrations'

const USER_ROLES = ['BUYER', 'SUPPLIER', 'COURIER', 'ADMIN']

/**
 * The users role CHECK predates the COURIER role: approving a courier in the
 * back-office promoted `user.role` to COURIER and Postgres rejected the flush
 * (HTTP 500). Rebuilt with the full enum.
 */
export class Migration20260830100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";')
    this.addSql(`ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN (${USER_ROLES.map(r => `'${r}'`).join(', ')}));`)
  }

  override async down(): Promise<void> {
    this.addSql('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";')
    this.addSql(`ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('BUYER', 'SUPPLIER', 'ADMIN'));`)
  }
}
