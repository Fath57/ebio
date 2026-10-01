import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'
import { config } from '../../config/env.config'
import { verifyAccountToken } from './jwt-auth.guard'

/**
 * The chat token lives seven days: what it says about the account must not
 * outlive a ban or a role change made in the meantime.
 */
function buildEm(user: Record<string, unknown> | null) {
  return { findOne: vi.fn().mockResolvedValue(user) }
}

const inputToken = jwt.sign({ sub: 'user-1', role: 'BUYER' }, config.jwt.secret, { expiresIn: '7d' })

describe('jeton du chat', () => {
  it('prend le rôle en base, pas celui figé dans le jeton', async () => {
    const mockEm = buildEm({ id: 'user-1', role: 'SUPPLIER', status: 'ACTIVE' })

    const actualPayload = await verifyAccountToken(mockEm as never, inputToken)

    expect(actualPayload.sub).toBe('user-1')
    expect(actualPayload.role).toBe('SUPPLIER')
  })

  it('refuse un compte banni depuis l\'émission du jeton', async () => {
    const mockEm = buildEm({ id: 'user-1', role: 'BUYER', status: 'BANNED' })

    await expect(verifyAccountToken(mockEm as never, inputToken)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuse un compte supprimé', async () => {
    await expect(verifyAccountToken(buildEm(null) as never, inputToken)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('refuse un jeton signé avec un autre secret', async () => {
    const inputForged = jwt.sign({ sub: 'user-1', role: 'ADMIN' }, 'not-the-secret')

    await expect(verifyAccountToken(buildEm({ id: 'user-1', status: 'ACTIVE' }) as never, inputForged)).rejects.toThrow()
  })
})
