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
  COURIER = 'COURIER',
  ADMIN = 'ADMIN',
}

/**
 * Account-level standing, independent of the supplier/courier profile
 * validation. SUSPENDED is temporary (see `suspendedUntil`), BANNED is not.
 * Plain string column on purpose: no CHECK constraint to migrate when a
 * value is added.
 */
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED'

@Entity({ tableName: 'users' })
export class User {
  [OptionalProps]?: 'id' | 'emailVerified' | 'role' | 'biometricEnabled' | 'status' | 'createdAt' | 'updatedAt'

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

  @Property({ type: 'string', length: 20, default: 'ACTIVE' })
  status: UserStatus = 'ACTIVE'

  /** Shown to the user when the account is suspended or banned. */
  @Property({ fieldName: 'status_reason', nullable: true })
  statusReason?: string

  /** End of a temporary suspension; null for a ban or an active account. */
  @Property({ fieldName: 'suspended_until', nullable: true })
  suspendedUntil?: Date

  @Property({ fieldName: 'status_changed_at', nullable: true })
  statusChangedAt?: Date

  /** Staff member who last changed the status. */
  @Property({ fieldName: 'status_changed_by', nullable: true })
  statusChangedBy?: string

  /**
   * Quand cette personne a accepté les conditions et la politique de
   * confidentialité.
   *
   * La case était cochée dans l'écran d'inscription et n'allait nulle part :
   * elle bloquait le bouton, et c'est tout. En cas de contestation il n'y
   * avait rien à montrer. Ces trois colonnes sont la trace — la date, d'où
   * elle vient, et quel texte était en vigueur ce jour-là.
   *
   * La première acceptation ne s'écrase jamais : ce qui compte est le moment
   * où l'accord a été donné, pas la dernière fois qu'on l'a redit.
   */
  @Property({ fieldName: 'terms_accepted_at', nullable: true })
  termsAcceptedAt?: Date | null

  /** L'application depuis laquelle l'accord a été donné. */
  @Property({ fieldName: 'terms_accepted_from', nullable: true })
  termsAcceptedFrom?: string | null

  /**
   * La version des documents acceptés.
   *
   * Enregistrée sans mécanique de re-consentement : on ne redemande rien aux
   * comptes existants quand les textes changent. Mais savoir *ce qui* a été
   * accepté est précisément ce qui sépare une preuve d'une date.
   */
  @Property({ fieldName: 'terms_version', nullable: true })
  termsVersion?: string | null

  @Property({ fieldName: 'createdAt' })
  createdAt: Date = new Date()

  @Property({ fieldName: 'updatedAt', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  /** A suspension past its end date no longer blocks anything. */
  isBlocked(): boolean {
    if (this.status === 'BANNED')
      return true
    if (this.status === 'SUSPENDED')
      return !this.suspendedUntil || this.suspendedUntil.getTime() > Date.now()
    return false
  }
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
