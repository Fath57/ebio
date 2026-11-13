import type { ExchangeRate } from './contracts/currency.contract'
import { DEFAULT_EUR_RATE } from '../settings/platform-settings.service'
import { ExchangeRatesService } from './exchange-rates.service'

/**
 * Ce que voit le payeur à l'étranger : la marge gonfle l'affichage, l'arrondi
 * va toujours vers le haut, et le FCFA ne se convertit pas.
 */
function buildService(options: { eur?: ExchangeRate, usd?: ExchangeRate, marginBps?: number } = {}) {
  const platformSettings = {
    getExchangeRates: vi.fn().mockResolvedValue({
      EUR: options.eur ?? DEFAULT_EUR_RATE,
      ...(options.usd ? { USD: options.usd } : {}),
    }),
    getFxMarginBps: vi.fn().mockResolvedValue(options.marginBps ?? 200),
  }
  return new ExchangeRatesService(platformSettings as never)
}

describe('conversion des prix pour l\'affichage', () => {
  it('6 559,57 FCFA en euros avec 2 % de marge donne 10,21 €', async () => {
    const service = buildService()

    await expect(service.toDisplay(6559.57, 'EUR')).resolves.toBe(10.21)
  })

  it('suit le taux EUR saisi au back-office : à 660, 10,15 €', async () => {
    const service = buildService({ eur: { xofPerUnit: 660, source: 'MANUAL', updatedAt: '2026-11-13T06:00:00.000Z' } })

    await expect(service.toDisplay(6559.57, 'EUR')).resolves.toBe(10.15)
  })

  it('sans marge, la parité officielle donne exactement 10,00 €', async () => {
    const service = buildService({ marginBps: 0 })

    await expect(service.toDisplay(6559.57, 'EUR')).resolves.toBe(10)
  })

  it('arrondit toujours au centime supérieur', async () => {
    const service = buildService({ marginBps: 0 })

    // 6 560 / 655.957 = 10.00065… : jamais 10,00
    await expect(service.toDisplay(6560, 'EUR')).resolves.toBe(10.01)
    // 1 FCFA reste un centime, pas zéro
    await expect(service.toDisplay(1, 'EUR')).resolves.toBe(0.01)
  })

  it('ne convertit pas le FCFA', async () => {
    const service = buildService()

    await expect(service.toDisplay(6559.57, 'XOF')).resolves.toBeNull()
    await expect(service.freeze(6559.57, 'XOF')).resolves.toBeNull()
  })

  it('fige le taux marge comprise, la marge et le total', async () => {
    const service = buildService()

    await expect(service.freeze(6559.57, 'EUR')).resolves.toEqual({
      fxRate: 642.83786,
      fxMarginBps: 200,
      displayTotal: 10.21,
    })
  })

  it('reste en FCFA pour une devise dont le taux n\'a jamais été obtenu', async () => {
    const service = buildService()

    await expect(service.freeze(6559.57, 'USD')).resolves.toBeNull()
  })

  it('ne signale jamais l\'euro comme périmé, mais signale un dollar vieux de plus de 72 h', async () => {
    const service = buildService({
      usd: { xofPerUnit: 600, source: 'AUTO', updatedAt: '2026-11-09T06:00:00.000Z' },
    })

    const view = await service.adminView(new Date('2026-11-13T07:00:00.000Z'))

    expect(view.rates.EUR?.stale).toBe(false)
    expect(view.rates.USD?.stale).toBe(true)
    expect(view.marginBps).toBe(200)
  })
})
