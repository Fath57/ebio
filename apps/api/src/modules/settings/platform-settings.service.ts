import type { DeliveryPricingConfig } from '../../common/delivery-fee'
import type { AppVersions } from '../app-version/app-version.contract'
import type { ExchangeRate, ExchangeRates, ExchangeRateSource, ForeignCurrency } from '../currency/contracts/currency.contract'
import type { ReferralRewards } from '../referrals/contracts/referral.contract'
import type { AssistantIdentity, BannerOffersInput, EscrowReleaseInput } from './contracts/delivery-pricing.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable } from '@nestjs/common'
import { DEFAULT_DELIVERY_PRICING } from '../../common/delivery-fee'
import { appVersionsSchema } from '../app-version/app-version.contract'
import { exchangeRatesSchema, fxMarginBpsSchema } from '../currency/contracts/currency.contract'
import { DEFAULT_FX_MARGIN_BPS, EUR_OFFICIAL_PARITY, FX_MARGIN_BPS_MAX } from '../currency/currency.constants'
import { referralRewardsSchema } from '../referrals/contracts/referral.contract'
import { assistantIdentitySchema, bannerOffersSchema, deliveryPricingConfigSchema, escrowReleaseSchema } from './contracts/delivery-pricing.contract'
import { PlatformSetting } from './platform-setting.entity'

export const DELIVERY_COMMISSION_RATE_KEY = 'delivery_commission_rate'
export const CASH_ON_DELIVERY_MAX_AMOUNT_KEY = 'cash_on_delivery_max_amount'
export const COURIER_MAX_DEBT_KEY = 'courier_max_debt'
export const SUPPLIER_MAX_DEBT_KEY = 'supplier_max_debt'
export const COURIER_OFFER_TIMEOUT_KEY = 'courier_offer_timeout_s'
export const COURIER_PICKUP_TIMEOUT_KEY = 'courier_pickup_timeout_min'
export const COURIER_PICKUP_WARNING_KEY = 'courier_pickup_warning_min'
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
export const REFERRAL_REWARDS_KEY = 'referral_rewards'
export const ESCROW_RELEASE_KEY = 'escrow_release'
export const PRODUCT_APPROVAL_REQUIRED_KEY = 'product_approval_required'
export const NEW_PRODUCT_ALERT_EMAILS_KEY = 'new_product_alert_emails'
export const EXCHANGE_RATES_KEY = 'exchange_rates'
export const FX_MARGIN_BPS_KEY = 'fx_margin_bps'
export const FAMILY_WALLET_ENABLED_KEY = 'family_wallet_enabled'
export const TERROIR_EXPORT_ENABLED_KEY = 'terroir_export_enabled'
export const EXPORT_PACKAGING_WEIGHT_G_KEY = 'export_packaging_weight_g'
export const EXPORT_COLLECTION_DAYS_KEY = 'export_collection_days'
export const EXPORT_WEIGHT_TOLERANCE_PCT_KEY = 'export_weight_tolerance_pct'
export const EXPORT_INSURANCE_RATE_BPS_KEY = 'export_insurance_rate_bps'
export const EXPORT_INSURANCE_MIN_KEY = 'export_insurance_min'
export const EXPORT_BANNED_CATEGORY_IDS_KEY = 'export_banned_category_ids'
export const EXPORT_PICKUP_REMINDER_DAYS_KEY = 'export_pickup_reminder_days'

/** Exchange rates as read: EUR always present, USD and CAD once downloaded or entered. */
export type ResolvedExchangeRates = ExchangeRates & { EUR: ExchangeRate }

/**
 * The euro until someone sets it: the fixed CFA parity. Manual by nature,
 * no download ever overwrites it.
 */
export const DEFAULT_EUR_RATE: ExchangeRate = {
  xofPerUnit: EUR_OFFICIAL_PARITY,
  source: 'MANUAL',
  updatedAt: null,
}

/**
 * Products go on sale at once until someone decides otherwise: turning review
 * on is a staffing decision, since every new product then waits for a person.
 */
export const DEFAULT_PRODUCT_APPROVAL_REQUIRED = false

/**
 * A day after delivery at most, time for a complaint about the parcel, and
 * at once when buyer and shop both confirmed it: nothing is left to wait for.
 */
export const DEFAULT_ESCROW_RELEASE: EscrowReleaseInput = {
  heuresApresConfirmation: 0,
  heuresMaximum: 24,
}

/**
 * Starting rates for referrals.
 *
 * A thousand francs each on the first delivered order, and a floor of two
 * thousand: without it a two-hundred-franc order would trigger two thousand
 * francs of reward.
 */
export const DEFAULT_REFERRAL_REWARDS: ReferralRewards = {
  sponsorAmount: 1_000,
  refereeAmount: 1_000,
  minOrderAmount: 2_000,
  active: true,
}

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
/** Deepest negative shop balance (FCFA) before cash orders stop; 0 = no limit. */
export const DEFAULT_SUPPLIER_MAX_DEBT = 10_000
/**
 * Seconds a courier has to take a run offered to them alone before it moves
 * to the next one. 40 s turned out too short on the road.
 */
export const DEFAULT_COURIER_OFFER_TIMEOUT_S = 90
export const COURIER_OFFER_TIMEOUT_MIN_S = 20
export const COURIER_OFFER_TIMEOUT_MAX_S = 600

/**
 * Minutes a courier has to pick a run up, counted from the latest of their
 * acceptance, the parcel being ready and the buyer's window nearing. 15 min
 * took runs away from couriers stuck in Cotonou traffic.
 */
export const DEFAULT_COURIER_PICKUP_TIMEOUT_MIN = 25
export const COURIER_PICKUP_TIMEOUT_MIN_MIN = 10
export const COURIER_PICKUP_TIMEOUT_MAX_MIN = 180
/** How long before taking the run back the courier is reminded. */
export const DEFAULT_COURIER_PICKUP_WARNING_MIN = 10
export const COURIER_PICKUP_WARNING_MIN_MIN = 1

export interface CourierPickupPolicy {
  timeoutMinutes: number
  warningMinutes: number
}

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
 * portrait means the one bundled with the app, changing the setting must be a
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

/**
 * The family wallet stays closed until someone opens it: holding money for
 * third parties needs a legal go-ahead first (plan, risks), so shipping it
 * dark makes the opening a decision rather than a deploy.
 */
export const DEFAULT_FAMILY_WALLET_ENABLED = false

/**
 * Terroir export (011) settings. The switch stays off until the agency
 * agreements are signed; the rest has workable defaults (data-model §5).
 */
export interface TerroirExportSettings {
  enabled: boolean
  /** Flat packaging weight added to every parcel estimate, in grams. */
  packagingWeightG: number
  /** Days eBio needs to collect from the shops before the deposit deadline. */
  collectionDays: number
  /** Weight gap above the estimate eBio absorbs, in percent. */
  weightTolerancePct: number
  /** Insurance price, in basis points of the declared value (300 = 3 %). */
  insuranceRateBps: number
  /** Insurance floor, FCFA. */
  insuranceMin: number
  /** Categories never exportable (fresh food, meat, milk, live plants…). */
  bannedCategoryIds: string[]
  /** Days a parcel waits at the pickup point before the buyer is reminded. */
  pickupReminderDays: number
}

export const DEFAULT_TERROIR_EXPORT_SETTINGS: TerroirExportSettings = {
  enabled: false,
  packagingWeightG: 300,
  collectionDays: 3,
  weightTolerancePct: 10,
  insuranceRateBps: 300,
  insuranceMin: 1000,
  bannedCategoryIds: [],
  pickupReminderDays: 14,
}

/** Bounds of each numeric terroir setting: [min, max]. */
export const TERROIR_EXPORT_BOUNDS = {
  packagingWeightG: [0, 5_000],
  collectionDays: [0, 30],
  weightTolerancePct: [0, 100],
  insuranceRateBps: [0, 5_000],
  insuranceMin: [0, 1_000_000],
  pickupReminderDays: [1, 90],
} as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  /**
   * Cash commissions push a shop balance negative; past this debt the shop
   * stops receiving cash orders until online sales or a top-up bring it back.
   */
  async getSupplierMaxDebt(): Promise<number> {
    const raw = await this.get(SUPPLIER_MAX_DEBT_KEY)
    const amount = raw === null ? Number.NaN : Number(raw)
    if (!Number.isInteger(amount) || amount < 0 || amount > CASH_LIMIT_CEILING) {
      return DEFAULT_SUPPLIER_MAX_DEBT
    }
    return amount
  }

  async setSupplierMaxDebt(amount: number): Promise<void> {
    if (!Number.isInteger(amount) || amount < 0 || amount > CASH_LIMIT_CEILING) {
      throw new BadRequestException('La dette maximale doit être un montant entier entre 0 et 10 000 000 FCFA')
    }
    await this.set(SUPPLIER_MAX_DEBT_KEY, String(amount))
  }

  /** Exclusive window of a targeted offer, in seconds. */
  async getCourierOfferTimeoutSeconds(): Promise<number> {
    return this.readInteger(COURIER_OFFER_TIMEOUT_KEY, DEFAULT_COURIER_OFFER_TIMEOUT_S, COURIER_OFFER_TIMEOUT_MIN_S, COURIER_OFFER_TIMEOUT_MAX_S)
  }

  async setCourierOfferTimeoutSeconds(seconds: number): Promise<void> {
    this.assertInteger(
      seconds,
      COURIER_OFFER_TIMEOUT_MIN_S,
      COURIER_OFFER_TIMEOUT_MAX_S,
      `Le délai doit être un nombre de secondes entre ${COURIER_OFFER_TIMEOUT_MIN_S} et ${COURIER_OFFER_TIMEOUT_MAX_S}`,
    )
    await this.set(COURIER_OFFER_TIMEOUT_KEY, String(seconds))
  }

  /** The warning always lands before the release, whatever the stored rows say. */
  async getCourierPickupPolicy(): Promise<CourierPickupPolicy> {
    const timeoutMinutes = await this.readInteger(
      COURIER_PICKUP_TIMEOUT_KEY,
      DEFAULT_COURIER_PICKUP_TIMEOUT_MIN,
      COURIER_PICKUP_TIMEOUT_MIN_MIN,
      COURIER_PICKUP_TIMEOUT_MAX_MIN,
    )
    const warningMinutes = await this.readInteger(
      COURIER_PICKUP_WARNING_KEY,
      DEFAULT_COURIER_PICKUP_WARNING_MIN,
      COURIER_PICKUP_WARNING_MIN_MIN,
      COURIER_PICKUP_TIMEOUT_MAX_MIN,
    )
    return { timeoutMinutes, warningMinutes: Math.min(warningMinutes, timeoutMinutes - 1) }
  }

  async setCourierPickupPolicy(policy: CourierPickupPolicy): Promise<void> {
    this.assertInteger(
      policy.timeoutMinutes,
      COURIER_PICKUP_TIMEOUT_MIN_MIN,
      COURIER_PICKUP_TIMEOUT_MAX_MIN,
      `Le délai de retrait doit être compris entre ${COURIER_PICKUP_TIMEOUT_MIN_MIN} et ${COURIER_PICKUP_TIMEOUT_MAX_MIN} minutes`,
    )
    this.assertInteger(
      policy.warningMinutes,
      COURIER_PICKUP_WARNING_MIN_MIN,
      policy.timeoutMinutes - 1,
      'Le rappel doit partir au moins une minute avant la fin du délai de retrait',
    )
    await this.set(COURIER_PICKUP_TIMEOUT_KEY, String(policy.timeoutMinutes))
    await this.set(COURIER_PICKUP_WARNING_KEY, String(policy.warningMinutes))
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

  /** What a referral pays, set from the back-office. */
  async getReferralRewards(): Promise<ReferralRewards> {
    const raw = await this.get(REFERRAL_REWARDS_KEY)
    if (raw === null) {
      return DEFAULT_REFERRAL_REWARDS
    }
    try {
      const parsed = referralRewardsSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : DEFAULT_REFERRAL_REWARDS
    }
    catch {
      return DEFAULT_REFERRAL_REWARDS
    }
  }

  async setReferralRewards(rewards: ReferralRewards): Promise<void> {
    await this.set(REFERRAL_REWARDS_KEY, JSON.stringify(rewards))
  }

  async getEscrowRelease(): Promise<EscrowReleaseInput> {
    const raw = await this.get(ESCROW_RELEASE_KEY)
    if (raw === null) {
      return DEFAULT_ESCROW_RELEASE
    }
    try {
      const parsed = escrowReleaseSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : DEFAULT_ESCROW_RELEASE
    }
    catch {
      return DEFAULT_ESCROW_RELEASE
    }
  }

  async setEscrowRelease(config: EscrowReleaseInput): Promise<void> {
    await this.set(ESCROW_RELEASE_KEY, JSON.stringify(escrowReleaseSchema.parse(config)))
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

  /** Is the family wallet open to payers and their relatives? */
  async getFamilyWalletEnabled(): Promise<boolean> {
    const raw = await this.get(FAMILY_WALLET_ENABLED_KEY)
    if (raw === null) {
      return DEFAULT_FAMILY_WALLET_ENABLED
    }
    return raw === 'true'
  }

  async setFamilyWalletEnabled(enabled: boolean): Promise<void> {
    await this.set(FAMILY_WALLET_ENABLED_KEY, enabled ? 'true' : 'false')
  }

  /** Is the terroir space open to buyers abroad? */
  async getTerroirExportEnabled(): Promise<boolean> {
    const raw = await this.get(TERROIR_EXPORT_ENABLED_KEY)
    if (raw === null) {
      return DEFAULT_TERROIR_EXPORT_SETTINGS.enabled
    }
    return raw === 'true'
  }

  /** Every terroir setting, each falling back to its default when missing or unreadable. */
  async getTerroirExportSettings(): Promise<TerroirExportSettings> {
    const defaults = DEFAULT_TERROIR_EXPORT_SETTINGS
    const bounds = TERROIR_EXPORT_BOUNDS
    return {
      enabled: await this.getTerroirExportEnabled(),
      packagingWeightG: await this.readInteger(EXPORT_PACKAGING_WEIGHT_G_KEY, defaults.packagingWeightG, ...bounds.packagingWeightG),
      collectionDays: await this.readInteger(EXPORT_COLLECTION_DAYS_KEY, defaults.collectionDays, ...bounds.collectionDays),
      weightTolerancePct: await this.readInteger(EXPORT_WEIGHT_TOLERANCE_PCT_KEY, defaults.weightTolerancePct, ...bounds.weightTolerancePct),
      insuranceRateBps: await this.readInteger(EXPORT_INSURANCE_RATE_BPS_KEY, defaults.insuranceRateBps, ...bounds.insuranceRateBps),
      insuranceMin: await this.readInteger(EXPORT_INSURANCE_MIN_KEY, defaults.insuranceMin, ...bounds.insuranceMin),
      bannedCategoryIds: await this.readBannedCategoryIds(),
      pickupReminderDays: await this.readInteger(EXPORT_PICKUP_REMINDER_DAYS_KEY, defaults.pickupReminderDays, ...bounds.pickupReminderDays),
    }
  }

  /** Writes only the settings sent; each one is checked before anything is written. */
  async setTerroirExportSettings(input: Partial<TerroirExportSettings>): Promise<TerroirExportSettings> {
    const bounds = TERROIR_EXPORT_BOUNDS
    const integers: Array<[keyof typeof bounds, string, string]> = [
      ['packagingWeightG', EXPORT_PACKAGING_WEIGHT_G_KEY, 'Le poids d\'emballage doit être compris entre 0 et 5 000 g'],
      ['collectionDays', EXPORT_COLLECTION_DAYS_KEY, 'Le délai de collecte doit être compris entre 0 et 30 jours'],
      ['weightTolerancePct', EXPORT_WEIGHT_TOLERANCE_PCT_KEY, 'Le seuil d\'écart de poids doit être compris entre 0 et 100 %'],
      ['insuranceRateBps', EXPORT_INSURANCE_RATE_BPS_KEY, 'Le taux d\'assurance doit être compris entre 0 et 50 %'],
      ['insuranceMin', EXPORT_INSURANCE_MIN_KEY, 'Le minimum d\'assurance doit être compris entre 0 et 1 000 000 FCFA'],
      ['pickupReminderDays', EXPORT_PICKUP_REMINDER_DAYS_KEY, 'Le rappel de retrait doit tomber entre 1 et 90 jours'],
    ]
    for (const [field, message] of integers) {
      const value = input[field]
      if (value !== undefined) {
        this.assertInteger(value, bounds[field][0], bounds[field][1], message)
      }
    }
    const banned = input.bannedCategoryIds
    if (banned !== undefined && (banned.length > 200 || banned.some(id => !UUID_PATTERN.test(id)))) {
      throw new BadRequestException('Liste de catégories interdites invalide')
    }

    if (input.enabled !== undefined) {
      await this.set(TERROIR_EXPORT_ENABLED_KEY, input.enabled ? 'true' : 'false')
    }
    for (const [field, key] of integers) {
      const value = input[field]
      if (value !== undefined) {
        await this.set(key, String(value))
      }
    }
    if (banned !== undefined) {
      await this.set(EXPORT_BANNED_CATEGORY_IDS_KEY, JSON.stringify([...new Set(banned)]))
    }
    return this.getTerroirExportSettings()
  }

  private async readBannedCategoryIds(): Promise<string[]> {
    const raw = await this.get(EXPORT_BANNED_CATEGORY_IDS_KEY)
    if (raw === null) {
      return [...DEFAULT_TERROIR_EXPORT_SETTINGS.bannedCategoryIds]
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    }
    catch {
      return []
    }
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

  /**
   * Reference rates (margin excluded). An unreadable row falls back to the
   * EUR parity alone: prices then show in FCFA and euros, never fail.
   */
  async getExchangeRates(): Promise<ResolvedExchangeRates> {
    const stored = await this.readExchangeRates()
    return { ...stored, EUR: stored.EUR ?? DEFAULT_EUR_RATE }
  }

  /**
   * Writes the given rates, keeping the others as they are. `MANUAL` comes
   * from the back-office, `AUTO` from the daily download.
   */
  async setExchangeRates(rates: Partial<Record<ForeignCurrency, number>>, source: ExchangeRateSource): Promise<ResolvedExchangeRates> {
    // Read past the cache: the cron and the back-office both write this row.
    this.cache.delete(EXCHANGE_RATES_KEY)
    const next: ExchangeRates = { ...await this.readExchangeRates() }
    const updatedAt = new Date().toISOString()
    for (const [currency, xofPerUnit] of Object.entries(rates) as Array<[ForeignCurrency, number | undefined]>) {
      if (xofPerUnit === undefined) {
        continue
      }
      if (!Number.isFinite(xofPerUnit) || xofPerUnit <= 0) {
        throw new BadRequestException(`Le taux ${currency} doit être un nombre positif`)
      }
      next[currency] = { xofPerUnit, source, updatedAt }
    }
    await this.set(EXCHANGE_RATES_KEY, JSON.stringify(exchangeRatesSchema.parse(next)))
    return { ...next, EUR: next.EUR ?? DEFAULT_EUR_RATE }
  }

  /** Margin taken off the reference rate, in basis points (200 = 2 %). */
  async getFxMarginBps(): Promise<number> {
    return this.readInteger(FX_MARGIN_BPS_KEY, DEFAULT_FX_MARGIN_BPS, 0, FX_MARGIN_BPS_MAX)
  }

  async setFxMarginBps(bps: number): Promise<void> {
    if (!fxMarginBpsSchema.safeParse(bps).success) {
      throw new BadRequestException(`La marge doit être un entier entre 0 et ${FX_MARGIN_BPS_MAX} points de base`)
    }
    await this.set(FX_MARGIN_BPS_KEY, String(bps))
  }

  private async readExchangeRates(): Promise<ExchangeRates> {
    const raw = await this.get(EXCHANGE_RATES_KEY)
    if (raw === null) {
      return {}
    }
    try {
      const parsed = exchangeRatesSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : {}
    }
    catch {
      return {}
    }
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

  /** Must a new product wait for eBio before buyers can see it? */
  async getProductApprovalRequired(): Promise<boolean> {
    const raw = await this.get(PRODUCT_APPROVAL_REQUIRED_KEY)
    if (raw === null) {
      return DEFAULT_PRODUCT_APPROVAL_REQUIRED
    }
    return raw === 'true'
  }

  async setProductApprovalRequired(required: boolean): Promise<void> {
    await this.set(PRODUCT_APPROVAL_REQUIRED_KEY, required ? 'true' : 'false')
  }

  /**
   * Addresses told of every new product. An unreadable row means nobody,
   * never a crash: this runs right after a shop saves a product.
   */
  async getNewProductAlertEmails(): Promise<string[]> {
    const raw = await this.get(NEW_PRODUCT_ALERT_EMAILS_KEY)
    if (raw === null) {
      return []
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    }
    catch {
      return []
    }
  }

  async setNewProductAlertEmails(emails: string[]): Promise<void> {
    // Typed by hand: the same address twice, or in capitals, is still one person.
    const unique = [...new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean))]
    await this.set(NEW_PRODUCT_ALERT_EMAILS_KEY, JSON.stringify(unique))
  }

  private async get(key: string): Promise<string | null> {
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }
    // `set` writes in raw SQL, past the identity map: without `refresh` a row
    // loaded earlier in the same context would come back with its old value.
    const row = await this.em.findOne(PlatformSetting, { key }, { refresh: true })
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
