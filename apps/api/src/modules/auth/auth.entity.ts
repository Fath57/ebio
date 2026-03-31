import type { Rel } from '@mikro-orm/core'
import {
  Entity,
  Enum,
  ManyToOne,
  OptionalProps,
  PrimaryKey,
  Property,

  Unique,
} from '@mikro-orm/core'
import { Role } from './entities/role.entity'

export enum UserRole {
  BUYER = 'BUYER',
  SUPPLIER = 'SUPPLIER',
  ADMIN = 'ADMIN',
}

@Entity({ tableName: 'users' })
export class User {
  [OptionalProps]?: 'id' | 'emailVerified' | 'role' | 'biometricEnabled' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  name!: string

  @Property()
  @Unique()
  email!: string

  @Property({ fieldName: 'emailVerified' })
  emailVerified: boolean = false

  @Property({ nullable: true })
  image?: string

  @Property({ nullable: true })
  @Unique()
  phone?: string

  @Enum({ items: () => UserRole, default: UserRole.BUYER })
  role: UserRole = UserRole.BUYER

  @ManyToOne(() => Role, { fieldName: 'role_id', nullable: true })
  userRole?: Rel<Role>

  @Property({ fieldName: 'deviceId', nullable: true })
  deviceId?: string

  @Property({ fieldName: 'biometricEnabled', default: false })
  biometricEnabled: boolean = false

  @Property({ fieldName: 'biometricKey', nullable: true })
  biometricKey?: string

  @Property({ fieldName: 'lastLoginAt', nullable: true })
  lastLoginAt?: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'session' })
export class Session {
  [OptionalProps]?: 'id' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ fieldName: 'expiresAt' })
  expiresAt!: Date

  @Property()
  @Unique()
  token!: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ fieldName: 'ipAddress', nullable: true })
  ipAddress?: string

  @Property({ fieldName: 'userAgent', nullable: true })
  userAgent?: string

  @ManyToOne(() => User, { fieldName: 'userId' })
  user!: User
}

@Entity({ tableName: 'account' })
export class Account {
  [OptionalProps]?: 'id' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ fieldName: 'accountId' })
  accountId!: string

  @Property({ fieldName: 'providerId' })
  providerId!: string

  @ManyToOne(() => User, { fieldName: 'userId' })
  user!: User

  @Property({ fieldName: 'accessToken', nullable: true })
  accessToken?: string

  @Property({ fieldName: 'refreshToken', nullable: true })
  refreshToken?: string

  @Property({ fieldName: 'idToken', nullable: true })
  idToken?: string

  @Property({ fieldName: 'accessTokenExpiresAt', nullable: true })
  accessTokenExpiresAt?: Date

  @Property({ fieldName: 'refreshTokenExpiresAt', nullable: true })
  refreshTokenExpiresAt?: Date

  @Property({ nullable: true })
  scope?: string

  @Property({ nullable: true })
  password?: string

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

@Entity({ tableName: 'verification' })
export class Verification {
  [OptionalProps]?: 'id' | 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property()
  identifier!: string

  @Property()
  value!: string

  @Property({ fieldName: 'expiresAt' })
  expiresAt!: Date

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
