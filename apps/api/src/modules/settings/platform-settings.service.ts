import type { DeliveryPricingConfig } from '../../common/delivery-fee'
import type { AppVersions } from '../app-version/app-version.contract'
import type { AssistantIdentity, BannerOffersInput } from './contracts/delivery-pricing.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable } from '@nestjs/common'
import { DEFAULT_DELIVERY_PRICING } from '../../common/delivery-fee'
import { appVersionsSchema } from '../app-version/app-version.contract'
import { assistantIdentitySchema, bannerOffersSchema, deliveryPricingConfigSchema } from './contracts/delivery-pricing.contract'
import { PlatformSetting } from './platform-setting.entity'

export const DELIVERY_COMMISSION_RATE_KEY = 'delivery_commission_rate'
export const CASH_ON_DELIVERY_MAX_AMOUNT_KEY = 'cash_on_delivery_max_amount'
export const COURIER_MAX_DEBT_KEY = 'courier_max_debt'
export const DELIVERY_PRICING_KEY = 'delivery_pricing'
export const BANNER_OFFERS_KEY = 'banner_offers'
export const ASSISTANT_ENABLED_KEY = 'assistant_enabled'
export const ASSISTANT_IDENTITY_KEY = 'assistant_identity'
export const PRODUCT_REVIEW_DELAY_HOURS_KEY = 'product_review_delay_hours'
export const CART_REMINDER_HOURS_KEY = 'cart_reminder_hours'
export const CART_REMINDER_COUNT_KEY = 'cart_reminder_count'
export const PRODUCT_REVIEW_MAX_INVITES_KEY = 'product_review_max_invites'
export const ANNOUNCEMENT_INTERVAL_HOURS_KEY = 'announcement_interval_hours'
export const ANNOUNCEMENT_OFFERS_KEY = 'announcement_offers'
export const APP_VERSIONS_KEY = 'app_versions'

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

/**
 * The assistant stays off until someone turns it on.
 *
 * Every turn calls a paid model, so an accidental opening is measured in money
 * rather than in noise. The spec opens it to a small group first; shipping it
 * dark makes that a decision instead of a side effect.
 */
export const DEFAULT_ASSISTANT_ENABLED = false

/**
 * Who she is, until someone says otherwise.
 *
 * The name is the one her prompt has carried since the first day, and a null
 * portrait means the one bundled with the app — changing the setting must be a
 * decision, never a side effect of shipping this.
 */
export const DEFAULT_ASSISTANT_IDENTITY: AssistantIdentity = {
  name: 'Assita',
  avatarUrl: null,
  // Measured over four runs rather than guessed: the same sentence averaged
  // 7.76 s at the rate she shipped with and 6.66 s here. The slider goes to
  // 1.4 for whoever finds that still too patient.
  voiceSpeed: 1.15,
}

/**
 * How long we wait before asking for a product review.
 *
 * Asking at delivery makes no sense: nobody has opened the bag yet. Twelve
 * hours let a meal happen, which is the minimum for having an opinion about
 * food.
 */
export const DEFAULT_PRODUCT_REVIEW_DELAY_HOURS = 12
/**
 * Long enough that a basket left mid-afternoon is not chased before evening,
 * short enough that the reason for filling it has not passed.
 */
export const DEFAULT_CART_REMINDER_HOURS = 6
/** One message. A basket that drew two and stayed put has been decided on. */
export const DEFAULT_CART_REMINDER_COUNT = 1

/** Beyond this, not answering is an answer. */
export const DEFAULT_PRODUCT_REVIEW_MAX_INVITES = 3

/**
 * How long before the same announcement may appear again.
 *
 * An announcement interrupts: it stands in front of what the buyer came to do.
 * Once a day is the rhythm people tolerate; configurable because a short,
 * important announcement sometimes deserves to insist.
 */
export const DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS = 24

/**
 * What the apps are told before anyone sets anything.
 *
 * The minimum sits at the first published version: nobody is ever blocked by
 * a default. Raising it is a deliberate act, for the release that must not be
 * skipped.
 */
export const DEFAULT_APP_VERSIONS = {
  client: { minimum: '1.0.0', latest: '1.4.0' },
  supplier: { minimum: '1.0.0', latest: '1.4.0' },
  courier: { minimum: '1.0.0', latest: '1.4.0' },
} as const

/** Durations and prices offered to shops for an announcement. */
export const DEFAULT_ANNOUNCEMENT_OFFERS: BannerOffersInput = {
  offers: [
    { days: 1, price: 2_000 },
    { days: 3, price: 5_000 },
    { days: 7, price: 10_000 },
  ],
  paidSlots: 1,
}

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

  /** How long a basket sits still before it is called abandoned. */
  async getCartReminderHours(): Promise<number> {
    return this.readInteger(CART_REMINDER_HOURS_KEY, DEFAULT_CART_REMINDER_HOURS, 1, 168)
  }

  async setCartReminderHours(hours: number): Promise<void> {
    this.assertInteger(hours, 1, 168, 'Le délai doit être un nombre d\'heures entre 1 et 168')
    await this.set(CART_REMINDER_HOURS_KEY, String(hours))
  }

  /** Reminders per basket. Zero switches the whole thing off. */
  async getCartReminderCount(): Promise<number> {
    return this.readInteger(CART_REMINDER_COUNT_KEY, DEFAULT_CART_REMINDER_COUNT, 0, 5)
  }

  async setCartReminderCount(count: number): Promise<void> {
    this.assertInteger(count, 0, 5, 'Le nombre de relances doit être compris entre 0 et 5')
    await this.set(CART_REMINDER_COUNT_KEY, String(count))
  }

  /** Hours between the delivery and the product-review ask. */
  async getProductReviewDelayHours(): Promise<number> {
    return this.readInteger(PRODUCT_REVIEW_DELAY_HOURS_KEY, DEFAULT_PRODUCT_REVIEW_DELAY_HOURS, 1, 720)
  }

  async setProductReviewDelayHours(hours: number): Promise<void> {
    this.assertInteger(hours, 1, 720, 'Le délai doit être un nombre d\'heures entre 1 et 720')
    await this.set(PRODUCT_REVIEW_DELAY_HOURS_KEY, String(hours))
  }

  /** Total number of invitations, reminders included. */
  async getProductReviewMaxInvites(): Promise<number> {
    return this.readInteger(PRODUCT_REVIEW_MAX_INVITES_KEY, DEFAULT_PRODUCT_REVIEW_MAX_INVITES, 1, 10)
  }

  async setProductReviewMaxInvites(count: number): Promise<void> {
    this.assertInteger(count, 1, 10, 'Le nombre de relances doit être compris entre 1 et 10')
    await this.set(PRODUCT_REVIEW_MAX_INVITES_KEY, String(count))
  }

  /** Hours before the same announcement may reappear to the same buyer. */
  async getAnnouncementIntervalHours(): Promise<number> {
    return this.readInteger(ANNOUNCEMENT_INTERVAL_HOURS_KEY, DEFAULT_ANNOUNCEMENT_INTERVAL_HOURS, 1, 720)
  }

  async setAnnouncementIntervalHours(hours: number): Promise<void> {
    this.assertInteger(hours, 1, 720, 'L\'intervalle doit être un nombre d\'heures entre 1 et 720')
    await this.set(ANNOUNCEMENT_INTERVAL_HOURS_KEY, String(hours))
  }

  /** Minimum and latest version of each app. */
  async getAppVersions(): Promise<AppVersions> {
    const raw = await this.get(APP_VERSIONS_KEY)
    if (raw === null) {
      return DEFAULT_APP_VERSIONS
    }
    try {
      const parsed = appVersionsSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : DEFAULT_APP_VERSIONS
    }
    catch {
      return DEFAULT_APP_VERSIONS
    }
  }

  async setAppVersions(versions: AppVersions): Promise<void> {
    await this.set(APP_VERSIONS_KEY, JSON.stringify(versions))
  }

  async getAnnouncementOffers(): Promise<BannerOffersInput> {
    const raw = await this.get(ANNOUNCEMENT_OFFERS_KEY)
    if (raw === null) {
      return DEFAULT_ANNOUNCEMENT_OFFERS
    }
    try {
      const parsed = bannerOffersSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : DEFAULT_ANNOUNCEMENT_OFFERS
    }
    catch {
      return DEFAULT_ANNOUNCEMENT_OFFERS
    }
  }

  async setAnnouncementOffers(config: BannerOffersInput): Promise<void> {
    const sorted = { ...config, offers: [...config.offers].sort((a, b) => a.days - b.days) }
    await this.set(ANNOUNCEMENT_OFFERS_KEY, JSON.stringify(sorted))
  }

  /** Is the conversational assistant open to buyers? */
  async getAssistantEnabled(): Promise<boolean> {
    const raw = await this.get(ASSISTANT_ENABLED_KEY)
    if (raw === null) {
      return DEFAULT_ASSISTANT_ENABLED
    }
    return raw === 'true'
  }

  async setAssistantEnabled(enabled: boolean): Promise<void> {
    await this.set(ASSISTANT_ENABLED_KEY, enabled ? 'true' : 'false')
  }

  /**
   * Her name and her portrait, always answerable.
   *
   * A malformed row falls back to the defaults rather than raising: this is
   * read on the public settings route and on every assistant turn, and an
   * assistant that will not speak because a name was saved badly is a worse
   * failure than one that answers to `Assita`.
   */
  async getAssistantIdentity(): Promise<AssistantIdentity> {
    const raw = await this.get(ASSISTANT_IDENTITY_KEY)
    if (raw === null) {
      return DEFAULT_ASSISTANT_IDENTITY
    }
    try {
      const parsed = assistantIdentitySchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : DEFAULT_ASSISTANT_IDENTITY
    }
    catch {
      return DEFAULT_ASSISTANT_IDENTITY
    }
  }

  async setAssistantIdentity(identity: AssistantIdentity): Promise<void> {
    await this.set(ASSISTANT_IDENTITY_KEY, JSON.stringify(identity))
  }

  /** Admin edits call this so the new value applies immediately. */
  invalidateCache(): void {
    this.cache.clear()
  }

  /** A bounded integer, or the default when the row is missing or unreadable. */
  private async readInteger(key: string, fallback: number, min: number, max: number): Promise<number> {
    const raw = await this.get(key)
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback
  }

  private assertInteger(value: number, min: number, max: number, message: string): void {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new BadRequestException(message)
    }
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
