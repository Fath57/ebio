import type { DeliveryPricingConfig } from '../../common/delivery-fee'
import type { BannerOffersInput } from './contracts/delivery-pricing.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable } from '@nestjs/common'
import { DEFAULT_DELIVERY_PRICING } from '../../common/delivery-fee'
import { bannerOffersSchema, deliveryPricingConfigSchema } from './contracts/delivery-pricing.contract'
import { PlatformSetting } from './platform-setting.entity'

export const DELIVERY_COMMISSION_RATE_KEY = 'delivery_commission_rate'
export const CASH_ON_DELIVERY_MAX_AMOUNT_KEY = 'cash_on_delivery_max_amount'
export const COURIER_MAX_DEBT_KEY = 'courier_max_debt'
export const DELIVERY_PRICING_KEY = 'delivery_pricing'
export const BANNER_OFFERS_KEY = 'banner_offers'

export const DEFAULT_BANNER_OFFERS: BannerOffersInput = {
  offers: [
    { days: 7, price: 5_000 },
    { days: 14, price: 9_000 },
    { days: 30, price: 15_000 },
  ],
  paidSlots: 3,
}

/** Applied when the row is missing or unreadable. */
export const DEFAULT_DELIVERY_COMMISSION_RATE = 0.1
/** Largest order total (FCFA) payable in cash at the door; 0 disables cash. */
export const DEFAULT_CASH_ON_DELIVERY_MAX_AMOUNT = 25_000
const CASH_LIMIT_CEILING = 10_000_000
/** Deepest negative courier balance (FCFA) before offers stop; 0 = no limit. */
export const DEFAULT_COURIER_MAX_DEBT = 5_000

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

  /**
   * Cash cap, integer FCFA. The courier fronts the goods to the shop and
   * collects the total at the door, so the cap bounds their exposure.
   */
  async getCashOnDeliveryMaxAmount(): Promise<number> {
    const raw = await this.get(CASH_ON_DELIVERY_MAX_AMOUNT_KEY)
    const amount = raw === null ? Number.NaN : Number(raw)
    if (!Number.isInteger(amount) || amount < 0 || amount > CASH_LIMIT_CEILING) {
      return DEFAULT_CASH_ON_DELIVERY_MAX_AMOUNT
    }
    return amount
  }

  async setCashOnDeliveryMaxAmount(amount: number): Promise<void> {
    if (!Number.isInteger(amount) || amount < 0 || amount > CASH_LIMIT_CEILING) {
      throw new BadRequestException('Le plafond espèces doit être un montant entier entre 0 et 10 000 000 FCFA')
    }
    await this.set(CASH_ON_DELIVERY_MAX_AMOUNT_KEY, String(amount))
  }

  /**
   * Cash commissions push a courier balance negative; past this debt the
   * courier stops receiving and accepting runs until they top up.
   */
  async getCourierMaxDebt(): Promise<number> {
    const raw = await this.get(COURIER_MAX_DEBT_KEY)
    const amount = raw === null ? Number.NaN : Number(raw)
    if (!Number.isInteger(amount) || amount < 0 || amount > CASH_LIMIT_CEILING) {
      return DEFAULT_COURIER_MAX_DEBT
    }
    return amount
  }

  async setCourierMaxDebt(amount: number): Promise<void> {
    if (!Number.isInteger(amount) || amount < 0 || amount > CASH_LIMIT_CEILING) {
      throw new BadRequestException('La dette maximale doit être un montant entier entre 0 et 10 000 000 FCFA')
    }
    await this.set(COURIER_MAX_DEBT_KEY, String(amount))
  }

  /** Platform delivery pricing; an unreadable or missing row yields the defaults. */
  async getDeliveryPricing(): Promise<DeliveryPricingConfig> {
    const raw = await this.get(DELIVERY_PRICING_KEY)
    if (raw === null) {
      return DEFAULT_DELIVERY_PRICING
    }
    try {
      const parsed = deliveryPricingConfigSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : DEFAULT_DELIVERY_PRICING
    }
    catch {
      return DEFAULT_DELIVERY_PRICING
    }
  }

  async setDeliveryPricing(config: DeliveryPricingConfig): Promise<void> {
    await this.set(DELIVERY_PRICING_KEY, JSON.stringify(config))
  }

  async getBannerOffers(): Promise<BannerOffersInput> {
    const raw = await this.get(BANNER_OFFERS_KEY)
    if (raw === null) {
      return DEFAULT_BANNER_OFFERS
    }
    try {
      const parsed = bannerOffersSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : DEFAULT_BANNER_OFFERS
    }
    catch {
      return DEFAULT_BANNER_OFFERS
    }
  }

  async setBannerOffers(config: BannerOffersInput): Promise<void> {
    const sorted = { ...config, offers: [...config.offers].sort((a, b) => a.days - b.days) }
    await this.set(BANNER_OFFERS_KEY, JSON.stringify(sorted))
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
