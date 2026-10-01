import type { MikroORM } from '@mikro-orm/postgresql'
import { describe, expect, it } from 'vitest'
import { Verification } from '../../modules/auth/auth.entity'
import { OtpService } from '../otp.service'

/**
 * Six digits valid five minutes: without a cap on guesses, a sign-in or
 * reset code can be enumerated. Checked on a real PostgreSQL because the cap
 * rests on a single UPDATE that parallel requests queue on.
 */
const PHONE = '+22997000000'
const CODE = '482913'

async function seedCode(orm: MikroORM, identifier: string): Promise<void> {
  const em = orm.em.fork()
  em.create(Verification, { identifier, value: CODE, expiresAt: new Date(Date.now() + 5 * 60_000) })
  await em.flush()
}

function buildService(orm: MikroORM): OtpService {
  return new OtpService(orm.em.fork(), {} as never, {} as never)
}

describe('essais sur un code à usage unique (e2e)', () => {
  it('accepte le bon code et le consomme', async (context) => {
    const orm = (context as unknown as { orm: MikroORM }).orm
    await seedCode(orm, `otp:${PHONE}`)
    const service = buildService(orm)

    await expect(service.verifyOtp(PHONE, CODE)).resolves.toBe(true)
    await expect(service.verifyOtp(PHONE, CODE)).resolves.toBe(false)
  })

  it('détruit le code au cinquième mauvais essai', async (context) => {
    const orm = (context as unknown as { orm: MikroORM }).orm
    await seedCode(orm, `otp:${PHONE}`)
    const service = buildService(orm)

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(service.verifyOtp(PHONE, '000000')).resolves.toBe(false)
    }

    await expect(service.verifyOtp(PHONE, CODE)).resolves.toBe(false)
  })

  it('ne donne que cinq essais à des requêtes parallèles', async (context) => {
    const orm = (context as unknown as { orm: MikroORM }).orm
    await seedCode(orm, `otp:${PHONE}`)

    const guesses = Array.from({ length: 20 }, (_, index) => String(100000 + index))
    await Promise.all(guesses.map(guess => buildService(orm).verifyOtp(PHONE, guess)))

    const [row] = await orm.em.fork().getConnection().execute(
      `SELECT attempts FROM verification WHERE identifier = ?`,
      [`otp:${PHONE}`],
    ) as Array<{ attempts: number }>
    expect(row.attempts).toBe(5)
    await expect(buildService(orm).verifyOtp(PHONE, CODE)).resolves.toBe(false)
  })

  it('compte aussi les essais de réinitialisation du mot de passe', async (context) => {
    const orm = (context as unknown as { orm: MikroORM }).orm
    await seedCode(orm, `reset:${PHONE}`)
    const service = buildService(orm)

    for (let attempt = 0; attempt < 5; attempt++) {
      await service.verifyPasswordResetOtp(PHONE, '000000')
    }

    await expect(service.verifyPasswordResetOtp(PHONE, CODE)).resolves.toBe(false)
    await expect(service.isResetVerified(PHONE)).resolves.toBe(false)
  })
})
