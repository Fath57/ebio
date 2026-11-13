import { describe, expect, it, vi } from 'vitest'
import { OtpAuthController } from './otp-auth.controller'

function controller() {
  const otp = {
    sendOtp: vi.fn().mockResolvedValue({ success: true }),
    verifyOtp: vi.fn().mockResolvedValue(true),
    consumeRegistrationToken: vi.fn().mockResolvedValue(true),
  }
  return { otp, controller: new OtpAuthController(otp as never, {} as never) }
}

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  }
  catch (error) {
    const body = (error as { getResponse: () => Record<string, unknown> }).getResponse()
    return body.code
  }
  return null
}

/** FR-034: a number abroad gets a code the apps turn into « Google, Apple or e-mail ». */
describe('codes SMS hors du Bénin', () => {
  it('refuse un numéro étranger avec PHONE_NOT_SUPPORTED, sans envoyer de SMS', async () => {
    const { otp, controller: api } = controller()

    expect(await codeOf(api.requestOtp({ phone: '+33612345678' }))).toBe('PHONE_NOT_SUPPORTED')
    expect(await codeOf(api.verifyOtp({ phone: '+15145551234', code: '123456' }))).toBe('PHONE_NOT_SUPPORTED')
    expect(await codeOf(api.registerWithToken({
      phone: '+33612345678',
      registrationToken: '6f1c2a54-9a0e-4c55-9d0b-0f3b8f6f4d11',
      name: 'Awa Diallo',
      password: 'Password123!',
    }))).toBe('PHONE_NOT_SUPPORTED')
    expect(otp.sendOtp).not.toHaveBeenCalled()
    expect(otp.verifyOtp).not.toHaveBeenCalled()
  })

  it('envoie le code à un numéro béninois', async () => {
    const { otp, controller: api } = controller()

    await expect(api.requestOtp({ phone: '+2290197123456' })).resolves.toEqual({ message: 'Code envoyé' })
    expect(otp.sendOtp).toHaveBeenCalledWith('+2290197123456')
  })
})
