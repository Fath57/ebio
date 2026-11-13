import { HttpException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../../config/env.config'
import { CheckoutStatus } from '../payments/entities/checkout.entity'
import { GiftNotifierService } from './gift-notifier.service'
import { giftWindowPhrase, handOverTimes } from './gift-texts'

const RECIPIENT_PHONE = '+2290197000001'

/**
 * A stand-in for the `checkouts` row the notifier claims before each text.
 * The real claims are single UPDATEs; this keeps the same rules — announced
 * once, a code once, three resends — so the service's logic is what is tested.
 */
function buildService(options: { window?: { start: Date, end: Date } | null } = {}) {
  const state = { announced: false, codeSent: null as string | null, resends: 0 }
  const execute = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('SET recipient_announced_at')) {
      if (state.announced) {
        return []
      }
      state.announced = true
      return [{ recipient_phone: RECIPIENT_PHONE, recipient_name: 'Afiavi Kossou', tracking_token: 'tok123', buyer_name: 'Awa Diallo' }]
    }
    if (sql.includes('MIN(delivery_window_start)')) {
      const window = options.window ?? null
      return [{ start: window?.start ?? null, end: window?.end ?? null }]
    }
    if (sql.includes('SET recipient_code_sent')) {
      const code = params[0] as string
      if (state.codeSent === code) {
        return []
      }
      state.codeSent = code
      return [{ recipient_phone: RECIPIENT_PHONE }]
    }
    if (sql.includes('recipient_sms_resend_count + 1')) {
      if (state.resends >= 3) {
        return []
      }
      state.resends += 1
      return [{ recipient_sms_resend_count: state.resends }]
    }
    if (sql.includes('FROM deliveries d')) {
      return state.codeSent ? [{ confirmation_code: state.codeSent }] : []
    }
    return []
  })
  const checkout = {
    id: 'checkout-1',
    buyer: { id: 'payer-1', name: 'Awa Diallo', email: 'awa@example.com' },
    status: CheckoutStatus.PAID,
    recipientName: 'Afiavi Kossou',
    recipientPhone: RECIPIENT_PHONE,
    trackingToken: 'tok123',
    recipientSmsResendCount: 0,
  }
  const em = {
    getConnection: () => ({ execute }),
    findOne: vi.fn().mockResolvedValue(checkout),
  }
  const sms = { send: vi.fn().mockResolvedValue(undefined) }
  const notifications = { send: vi.fn().mockResolvedValue(undefined) }
  const media = { getSignedUrl: vi.fn(), readObject: vi.fn() }
  const email = { sendTemplatedEmail: vi.fn().mockResolvedValue(undefined) }
  const service = new GiftNotifierService(em as never, sms as never, notifications as never, media as never, email as never)
  return { service, sms, execute, state }
}

describe('giftNotifierService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Thursday 19 November 2026, 13:00 in Cotonou.
    vi.setSystemTime(new Date('2026-11-19T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('annonce le panier au proche, avec le créneau et le lien, sans code', async () => {
    const { service, sms } = buildService({
      window: { start: new Date('2026-11-20T09:00:00Z'), end: new Date('2026-11-20T11:00:00Z') },
    })

    await service.announceToRecipient('checkout-1')

    expect(sms.send).toHaveBeenCalledTimes(1)
    expect(sms.send).toHaveBeenCalledWith(
      RECIPIENT_PHONE,
      `Awa vous envoie un panier eBio, livré demain entre 10 h et 12 h. Suivi : ${config.clients.publicSite.url}/suivi/tok123`,
    )
    expect(sms.send.mock.calls[0][1]).not.toMatch(/code/i)

    // A replayed confirmation sends nothing.
    await service.announceToRecipient('checkout-1')
    expect(sms.send).toHaveBeenCalledTimes(1)
  })

  it('envoie le code une seule fois pour une tournée de deux commandes', async () => {
    const { service, sms } = buildService()

    // Both orders of the run reach the hand-over step with the run's single code.
    await service.sendCodeToRecipient('checkout-1', '4821')
    await service.sendCodeToRecipient('checkout-1', '4821')

    expect(sms.send).toHaveBeenCalledTimes(1)
    expect(sms.send).toHaveBeenCalledWith(RECIPIENT_PHONE, 'Votre panier eBio arrive. Code à donner au livreur : 4821')

    // A reassigned courier draws a new code: that one is sent.
    await service.sendCodeToRecipient('checkout-1', '1357')
    expect(sms.send).toHaveBeenCalledTimes(2)
  })

  it('ne lève rien quand Wirepick refuse le message', async () => {
    const { service, sms } = buildService()
    sms.send.mockRejectedValue(new Error('SMS send failed'))

    await expect(service.announceToRecipient('checkout-1')).resolves.toBeUndefined()
    await expect(service.sendCodeToRecipient('checkout-1', '4821')).resolves.toBeUndefined()
    expect(sms.send).toHaveBeenCalledTimes(2)
  })

  it('renvoie le dernier SMS utile trois fois, puis répond 429', async () => {
    const { service, sms } = buildService()
    await service.sendCodeToRecipient('checkout-1', '4821')
    sms.send.mockClear()

    for (let attempt = 0; attempt < 3; attempt++) {
      await service.resendToRecipient('checkout-1', 'payer-1')
    }
    // The courier is on the way: the code is what the relative needs.
    expect(sms.send).toHaveBeenCalledTimes(3)
    expect(sms.send).toHaveBeenLastCalledWith(RECIPIENT_PHONE, 'Votre panier eBio arrive. Code à donner au livreur : 4821')

    const fourth = await service.resendToRecipient('checkout-1', 'payer-1').catch((error: unknown) => error)
    expect(fourth).toBeInstanceOf(HttpException)
    expect((fourth as HttpException).getStatus()).toBe(429)
    expect(((fourth as HttpException).getResponse() as { code: string }).code).toBe('RECIPIENT_SMS_LIMIT')
    expect(sms.send).toHaveBeenCalledTimes(3)
  })

  it('refuse le renvoi à quelqu\'un d\'autre que le payeur', async () => {
    const { service } = buildService()
    await expect(service.resendToRecipient('checkout-1', 'intrus')).rejects.toThrow('Passage en caisse introuvable')
  })
})

describe('textes au proche et au payeur', () => {
  it('dit le créneau en heure du Bénin', () => {
    const now = new Date('2026-11-19T07:00:00Z')
    expect(giftWindowPhrase({ start: new Date('2026-11-19T13:30:00Z'), end: new Date('2026-11-19T15:00:00Z') }, now))
      .toBe('aujourd\'hui entre 14 h 30 et 16 h')
    expect(giftWindowPhrase({ start: new Date('2026-11-22T07:00:00Z'), end: new Date('2026-11-22T09:00:00Z') }, now))
      .toBe('le 22/11 entre 8 h et 10 h')
  })

  it('donne l\'heure de remise au Bénin, et chez le payeur quand on la connaît', () => {
    const at = new Date('2026-11-20T09:42:00Z')
    // Paris in winter reads the same clock as Cotonou: said once.
    expect(handOverTimes(at, 'Europe/Paris')).toEqual({ benin: '10 h 42', payer: null })
    expect(handOverTimes(new Date('2026-07-20T09:42:00Z'), 'Europe/Paris')).toEqual({ benin: '10 h 42', payer: '11 h 42 (heure de Paris)' })
    expect(handOverTimes(at, 'America/Montreal')).toEqual({ benin: '10 h 42', payer: '4 h 42 (heure de Montreal)' })
    expect(handOverTimes(at, null)).toEqual({ benin: '10 h 42', payer: null })
    expect(handOverTimes(at, 'Africa/Porto-Novo')).toEqual({ benin: '10 h 42', payer: null })
  })
})
