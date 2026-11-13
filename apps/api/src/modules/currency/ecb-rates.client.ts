import { Injectable } from '@nestjs/common'
import { z } from 'zod'

const ECB_CROSS_URL = 'https://api.frankfurter.dev/v1/latest?from=EUR&to=USD,CAD'

const ecbCrossResponseSchema = z.object({
  base: z.literal('EUR'),
  rates: z.object({
    USD: z.number().positive(),
    CAD: z.number().positive(),
  }),
})

export interface EurCross {
  /** USD for one euro. */
  USD: number
  /** CAD for one euro. */
  CAD: number
}

/**
 * European Central Bank reference rates, through Frankfurter (free, no key).
 * Only the euro crosses are read: XOF is pegged to the euro, so the dollar in
 * XOF follows from the official parity.
 */
@Injectable()
export class EcbRatesClient {
  async fetchEurCross(): Promise<EurCross> {
    const response = await fetch(ECB_CROSS_URL, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) {
      throw new Error(`Frankfurter answered ${response.status}`)
    }
    const parsed = ecbCrossResponseSchema.parse(await response.json())
    return { USD: parsed.rates.USD, CAD: parsed.rates.CAD }
  }
}
