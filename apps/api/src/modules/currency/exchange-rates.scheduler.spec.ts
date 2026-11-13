import type { ExchangeRates } from './contracts/currency.contract'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { EUR_OFFICIAL_PARITY } from './currency.constants'
import { ExchangeRatesScheduler } from './exchange-rates.scheduler'

/**
 * Le téléchargement quotidien : il met à jour le dollar américain et
 * canadien, ne touche jamais l'euro, et ne perd rien quand la BCE ne répond pas.
 * Le vrai service de paramètres tourne sur une table en mémoire.
 */
function buildScheduler(stored: ExchangeRates) {
  const rows = new Map<string, string>([['exchange_rates', JSON.stringify(stored)]])
  const em = {
    findOne: vi.fn().mockImplementation(async (_entity: unknown, where: { key: string }) => {
      const value = rows.get(where.key)
      return value === undefined ? null : { key: where.key, value }
    }),
    getConnection: () => ({
      execute: vi.fn().mockImplementation(async (_sql: string, [key, value]: [string, string]) => {
        rows.set(key, value)
      }),
    }),
  }
  const platformSettings = new PlatformSettingsService(em as never)
  const ecb = { fetchEurCross: vi.fn() }
  const scheduler = new ExchangeRatesScheduler(em as never, platformSettings, ecb as never)
  const read = (): ExchangeRates => JSON.parse(rows.get('exchange_rates') ?? '{}') as ExchangeRates
  return { scheduler, ecb, read }
}

const MANUAL_EUR = { xofPerUnit: 660, source: 'MANUAL' as const, updatedAt: '2026-11-10T09:00:00.000Z' }
const OLD_USD = { xofPerUnit: 590, source: 'MANUAL' as const, updatedAt: '2026-11-10T09:00:00.000Z' }

describe('téléchargement quotidien des taux', () => {
  it('met USD et CAD à jour en AUTO depuis la parité officielle', async () => {
    const { scheduler, ecb, read } = buildScheduler({ EUR: MANUAL_EUR, USD: OLD_USD })
    ecb.fetchEurCross.mockResolvedValue({ USD: 1.08, CAD: 1.5 })

    await expect(scheduler.refresh()).resolves.toBe(true)

    const rates = read()
    expect(rates.USD?.source).toBe('AUTO')
    expect(rates.USD?.xofPerUnit).toBeCloseTo(EUR_OFFICIAL_PARITY / 1.08, 6)
    expect(rates.CAD?.source).toBe('AUTO')
    expect(rates.CAD?.xofPerUnit).toBeCloseTo(EUR_OFFICIAL_PARITY / 1.5, 6)
  })

  it('laisse l\'euro saisi intact', async () => {
    const { scheduler, ecb, read } = buildScheduler({ EUR: MANUAL_EUR })
    ecb.fetchEurCross.mockResolvedValue({ USD: 1.08, CAD: 1.5 })

    await scheduler.refresh()

    expect(read().EUR).toEqual(MANUAL_EUR)
  })

  it('garde les derniers taux quand la BCE ne répond pas', async () => {
    const { scheduler, ecb, read } = buildScheduler({ EUR: MANUAL_EUR, USD: OLD_USD })
    ecb.fetchEurCross.mockRejectedValue(new Error('timeout'))

    await expect(scheduler.refresh()).resolves.toBe(false)

    expect(read()).toEqual({ EUR: MANUAL_EUR, USD: OLD_USD })
  })
})
