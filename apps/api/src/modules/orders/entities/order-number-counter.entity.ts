import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

/**
 * Last order number given on a day (`YYYYMMDD`). Only read and bumped in raw
 * SQL by OrdersService.allocateOrderNumbers; declared so the schema built
 * from entities (tests) has the table.
 */
@Entity({ tableName: 'order_number_counters' })
export class OrderNumberCounter {
  @PrimaryKey({ length: 8 })
  day!: string

  @Property({ type: 'integer' })
  last!: number
}
