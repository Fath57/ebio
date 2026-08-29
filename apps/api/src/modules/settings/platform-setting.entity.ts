import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core'

/**
 * Key/value store for platform-wide knobs an admin tunes from the back
 * office (delivery commission rate, …). Values are stored as text and parsed
 * by PlatformSettingsService, which is the only reader.
 */
@Entity({ tableName: 'platform_settings' })
export class PlatformSetting {
  [OptionalProps]?: 'updatedAt'

  @PrimaryKey({ length: 64 })
  key!: string

  @Property({ type: 'text' })
  value!: string

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
