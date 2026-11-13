import { Migration } from '@mikro-orm/migrations'

/**
 * One counter row per day of order numbers. Counting the day's orders to
 * pick the next number let two checkouts started at the same moment read the
 * same count and collide on the unique `order_number`; an upsert on this row
 * hands each caller its own range instead.
 */
export class Migration20261116090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "order_number_counters" (
        "day" varchar(8) not null,
        "last" int not null,
        constraint "order_number_counters_pkey" primary key ("day")
      );`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "order_number_counters";`)
  }
}
