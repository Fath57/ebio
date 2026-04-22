import { randomUUID } from 'node:crypto'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { Account, Session, User, UserRole } from './auth.entity'

@Injectable()
export class OtpAuthService {
  private readonly logger = new Logger(OtpAuthService.name)

  constructor(private readonly em: EntityManager) {}

  async findByPhone(phone: string): Promise<User | null> {
    return this.em.fork().findOne(User, { phone })
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.em.fork().findOne(User, { email })
  }

  async findByPhoneOrEmail(identifier: string): Promise<User | null> {
    const fork = this.em.fork()
    if (identifier.startsWith('+')) {
      return fork.findOne(User, { phone: identifier })
    }
    return fork.findOne(User, { email: identifier })
  }

  async loginWithPhone(phone: string, password?: string): Promise<{ accessToken: string, user: { id: string, name: string, phone: string | null, role: string } } | 'wrong_password' | null> {
    const fork = this.em.fork()
    const user = await fork.findOne(User, { phone })
    if (!user)
      return null

    // Verify password if provided
    if (password) {
      const account = await fork.findOne(Account, { user, providerId: 'credential' })
      if (!account?.password)
        return 'wrong_password'

      const valid = await this.verifyPwd(password, account.password)
      if (!valid)
        return 'wrong_password'
    }

    const session = await this.createSession(fork, user)

    return {
      accessToken: session.token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone ?? null,
        role: user.role,
      },
    }
  }

  async registerWithPhone(phone: string, name: string, password: string) {
    const fork = this.em.fork()

    // Create user with phone, generate a placeholder email
    const user = fork.create(User, {
      name,
      phone,
      email: `${phone.replace('+', '')}@phone.ebio.app`,
      emailVerified: false,
      role: UserRole.BUYER,
    })

    await fork.flush()

    // Create credential account with hashed password
    fork.create(Account, {
      accountId: user.id,
      providerId: 'credential',
      user,
      password: await this.hashPwd(password),
    })

    const session = await this.createSession(fork, user)

    await fork.flush()

    return {
      accessToken: session.token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone ?? null,
        role: user.role,
      },
      isNewUser: true,
    }
  }

  async registerWithEmail(email: string, name: string, password: string) {
    const fork = this.em.fork()

    const user = fork.create(User, {
      name,
      email,
      emailVerified: true,
      role: UserRole.BUYER,
    })

    await fork.flush()

    fork.create(Account, {
      accountId: user.id,
      providerId: 'credential',
      user,
      password: await this.hashPwd(password),
    })

    const session = await this.createSession(fork, user)

    await fork.flush()

    return {
      accessToken: session.token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone ?? null,
        role: user.role,
      },
      isNewUser: true,
    }
  }

  async resetPassword(identifier: string, newPassword: string): Promise<void> {
    const fork = this.em.fork()

    const user = identifier.startsWith('+')
      ? await fork.findOne(User, { phone: identifier })
      : await fork.findOne(User, { email: identifier })

    if (!user) {
      throw new Error('Utilisateur introuvable')
    }

    // Find the credential account and update password
    const account = await fork.findOne(Account, { user, providerId: 'credential' })
    if (account) {
      account.password = await this.hashPwd(newPassword)
      await fork.flush()
    }
    else {
      // User registered via phone — create a credential account with password
      fork.create(Account, {
        accountId: user.id,
        providerId: 'credential',
        user,
        password: await this.hashPwd(newPassword),
      })
      await fork.flush()
    }

    this.logger.debug(`Password reset for user ${user.id}`)
  }

  private hashPwd(password: string): Promise<string> {
    return hashPassword(password)
  }

  private verifyPwd(password: string, stored: string): Promise<boolean> {
    return verifyPassword({ password, hash: stored })
  }

  private async createSession(fork: EntityManager, user: User): Promise<Session> {
    const token = randomUUID()
    const session = fork.create(Session, {
      user,
      token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    })

    user.lastLoginAt = new Date()
    await fork.flush()

    return session
  }
}
