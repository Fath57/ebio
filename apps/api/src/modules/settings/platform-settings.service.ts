import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable } from '@nestjs/common'
import { PlatformSetting } from './platform-setting.entity'

export const DELIVERY_COMMISSION_RATE_KEY = 'delivery_commission_rate'

/** Applied when the row is missing or unreadable. */
export const DEFAULT_DELIVERY_COMMISSION_RATE = 0.1

/** Same short cache as CommissionService: settings change rarely, deliveries are created often. */
const CACHE_TTL_MS = 60_000

@Injectable()
export class PlatformSettingsService {
  private cache = new Map<string, { value: string | null, expiresAt: number }>()

  constructor(private readonly em: EntityManager) {}

  /** eBio's share of the delivery fee, as a fraction (0.10 = 10 %). */
  async getDeliveryCommissionRate(): Promise<number> {
    const raw = await this.get(DELIVERY_COMMISSION_RATE_KEY)
    const rate = raw === null ? Number.NaN : Number(raw)
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      return DEFAULT_DELIVERY_COMMISSION_RATE
    }
    return rate
  }

  async setDeliveryCommissionRate(rate: number): Promise<void> {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new BadRequestException('Le taux de commission doit être compris entre 0 et 1')
    }
    await this.set(DELIVERY_COMMISSION_RATE_KEY, String(rate))
  }

  /** Admin edits call this so the new value applies immediately. */
  invalidateCache(): void {
    this.cache.clear()
  }

  private async get(key: string): Promise<string | null> {
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }
    const row = await this.em.findOne(PlatformSetting, { key })
    const value = row?.value ?? null
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
    return value
  }

  private async set(key: string, value: string): Promise<void> {
    await this.em.getConnection().execute(
      `INSERT INTO platform_settings (key, value, "updatedAt")
       VALUES (?, ?, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [key, value],
    )
    this.invalidateCache()
  }
}
