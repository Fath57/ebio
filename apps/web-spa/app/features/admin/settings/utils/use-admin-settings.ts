import type { BannerOffers, DeliveryPricingConfig } from '@boilerstone/openapi-generator/client/types.gen'
import type { CommissionCategoryRate } from '../forms/commission-form'
import type { EscrowReleaseFormData } from '../forms/escrow-release-form'
import type { NewProductSettings } from '../forms/new-product-settings-form'
import type { PickupPolicyFormData } from '../forms/pickup-policy-form'
import type { ReferralRewardsFormData } from '../forms/referral-rewards-form'
import type { ExchangeRatesData, ExchangeRatesUpdate } from './exchange-rates-queries'
import { client } from '@boilerstone/openapi-generator'
import {
  adminAssistantControllerGet,
  adminAssistantControllerUpdate,
  adminBannerOffersControllerGet,
  adminBannerOffersControllerUpdate,
  adminControllerUpdateCashOnDeliveryLimit,
  adminControllerUpdateCommissions,
  adminControllerUpdateCourierDebtLimit,
  adminControllerUpdateCourierOfferTimeout,
  adminControllerUpdateCourierPickupPolicy,
  adminControllerUpdateDeliveryCommission,
  adminControllerUpdateSupplierDebtLimit,
  adminDeliveryPricingControllerGet,
  adminDeliveryPricingControllerUpdate,
  adminNewProductSettingsControllerGet,
  adminNewProductSettingsControllerUpdate,
  adminProductReviewTimingControllerGet,
  adminProductReviewTimingControllerUpdate,
  adminReferralRewardsControllerGet,
  adminReferralRewardsControllerUpdate,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  EXCHANGE_RATES_QUERY_KEY,
  fetchExchangeRatesQueryOptions,
  refreshExchangeRates,
  updateExchangeRates,
} from './exchange-rates-queries'

export interface AdminSettingsData {
  commissions: CommissionCategoryRate[]
  /** eBio's share of the delivery fee as a fraction (0.10 = 10 %). */
  deliveryCommissionRate: number
  /** Maximum order total payable in cash on delivery, in FCFA (0 = disabled). */
  cashOnDeliveryMaxAmount: number
  /** Deepest negative courier balance before runs are suspended (0 = no limit). */
  courierMaxDebt: number
  /** Deepest negative shop balance before cash orders are refused (0 = no limit). */
  supplierMaxDebt?: number
  courierOfferTimeoutSeconds?: number
  courierPickupPolicy?: PickupPolicyFormData
}

export interface AssistantSetting {
  enabled: boolean
  name: string
  avatarUrl: string | null
  voiceSpeed: number
}

export interface ProductReviewTiming {
  delaiHeures: number
  relancesMaximum: number
}

export type SaveFeedback = 'saved' | 'error' | null
export type FxFeedback = 'saved' | 'error' | 'refreshed' | 'notRefreshed' | 'refreshError' | null

/** A setting's save action, its pending flag and the message shown under its form. */
export interface SettingSave<T> {
  save: (input: T) => void
  isPending: boolean
  feedback: SaveFeedback
}

export const DEFAULT_PICKUP_POLICY: PickupPolicyFormData = { timeoutMinutes: 25, warningMinutes: 10 }

function fetchDeliveryPricingQueryOptions() {
  return {
    queryKey: ['admin', 'delivery-pricing'],
    queryFn: async () => {
      const response = await adminDeliveryPricingControllerGet()
      if (response.error)
        throw new Error('Failed to fetch delivery pricing')
      return response.data as DeliveryPricingConfig
    },
  }
}

function fetchReferralRewardsQueryOptions() {
  return {
    queryKey: ['admin', 'referral-rewards'],
    queryFn: async () => {
      const response = await adminReferralRewardsControllerGet()
      if (response.error)
        throw new Error('Failed to fetch referral rewards')
      return response.data as ReferralRewardsFormData
    },
  }
}

function fetchBannerOffersQueryOptions() {
  return {
    queryKey: ['admin', 'banner-offers'],
    queryFn: async () => {
      const response = await adminBannerOffersControllerGet()
      if (response.error)
        throw new Error('Failed to fetch banner offers')
      return response.data as BannerOffers
    },
  }
}

function fetchAssistantQueryOptions() {
  return {
    queryKey: ['admin', 'assistant'],
    queryFn: async () => {
      const response = await adminAssistantControllerGet()
      if (response.error)
        throw new Error('Failed to fetch assistant setting')
      return response.data as AssistantSetting
    },
  }
}

/**
 * The SDK has no function for /api/admin/escrow-release yet: it goes through
 * the shared client, like GET /api/admin/settings below. Same session, same
 * base URL; swap for the generated functions once the SDK is regenerated.
 */
function fetchEscrowReleaseQueryOptions() {
  return {
    queryKey: ['admin', 'escrow-release'],
    queryFn: async () => {
      const result = await client.get({ url: '/api/admin/escrow-release' })
      if (result.error)
        throw new Error('Failed to fetch escrow release delays')
      return result.data as EscrowReleaseFormData
    },
  }
}

function fetchNewProductSettingsQueryOptions() {
  return {
    queryKey: ['admin', 'new-products'],
    queryFn: async () => {
      const response = await adminNewProductSettingsControllerGet()
      if (response.error)
        throw new Error('Failed to fetch new product settings')
      return response.data as NewProductSettings
    },
  }
}

function fetchProductReviewTimingQueryOptions() {
  return {
    queryKey: ['admin', 'product-review-timing'],
    queryFn: async () => {
      const response = await adminProductReviewTimingControllerGet()
      if (response.error)
        throw new Error('Failed to fetch product review timing')
      return response.data as ProductReviewTiming
    },
  }
}

function fetchAdminSettingsQueryOptions() {
  return {
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      // No dedicated SDK function for GET /api/admin/settings, fallback to client
      const result = await client.get({ url: '/api/admin/settings' })
      return result.data as AdminSettingsData
    },
  }
}

/**
 * Every setting saves the same way: the message under the form is cleared
 * when the request leaves, then says "saved" or "error" when it comes back.
 * `onSaved` refreshes whatever cache the setting feeds.
 */
function useSettingSave<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  onSaved: (saved: TOutput) => void,
): SettingSave<TInput> {
  const [feedback, setFeedback] = useState<SaveFeedback>(null)
  const { mutate, isPending } = useMutation({
    mutationFn,
    onMutate: () => {
      setFeedback(null)
    },
    onSuccess: (saved) => {
      setFeedback('saved')
      onSaved(saved)
    },
    onError: () => {
      setFeedback('error')
    },
  })
  return { save: input => mutate(input), isPending, feedback }
}

/**
 * Everything the settings page reads and writes, gathered in one place so the
 * registry's render functions only receive data and actions.
 */
export function useAdminSettings() {
  const queryClient = useQueryClient()
  const [fxFeedback, setFxFeedback] = useState<FxFeedback>(null)

  const settingsQuery = useQuery(fetchAdminSettingsQueryOptions())
  const pricingQuery = useQuery(fetchDeliveryPricingQueryOptions())
  const bannerOffersQuery = useQuery(fetchBannerOffersQueryOptions())
  const referralQuery = useQuery(fetchReferralRewardsQueryOptions())
  const assistantQuery = useQuery(fetchAssistantQueryOptions())
  const reviewQuery = useQuery(fetchProductReviewTimingQueryOptions())
  const escrowQuery = useQuery(fetchEscrowReleaseQueryOptions())
  const newProductsQuery = useQuery(fetchNewProductSettingsQueryOptions())
  const fxQuery = useQuery(fetchExchangeRatesQueryOptions())

  const invalidateSettings = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
  }

  const { mutate: updateCommissions, isPending: isCommissionsPending } = useMutation({
    mutationFn: async (rates: Array<{ category: string, rate: number }>) => {
      const response = await adminControllerUpdateCommissions({ body: { rates } })
      if (response.error)
        throw new Error('Failed to update commissions')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'commissions'] })
    },
  })

  const deliveryCommission = useSettingSave(async (rate: number) => {
    const response = await adminControllerUpdateDeliveryCommission({ body: { rate } })
    if (response.error)
      throw new Error('Failed to update delivery commission')
    return response.data
  }, invalidateSettings)

  const cashLimit = useSettingSave(async (amount: number) => {
    const response = await adminControllerUpdateCashOnDeliveryLimit({ body: { amount } })
    if (response.error)
      throw new Error('Failed to update cash on delivery limit')
    return response.data
  }, invalidateSettings)

  const offerTimeout = useSettingSave(async (seconds: number) => {
    const response = await adminControllerUpdateCourierOfferTimeout({ body: { seconds } })
    if (response.error)
      throw new Error('Failed to update courier offer timeout')
    return response.data
  }, invalidateSettings)

  const pickupPolicy = useSettingSave(async (policy: PickupPolicyFormData) => {
    const response = await adminControllerUpdateCourierPickupPolicy({ body: policy })
    if (response.error)
      throw new Error('Failed to update courier pickup policy')
    return response.data
  }, invalidateSettings)

  const debtLimit = useSettingSave(async (amount: number) => {
    const response = await adminControllerUpdateCourierDebtLimit({ body: { amount } })
    if (response.error)
      throw new Error('Failed to update courier debt limit')
    return response.data
  }, invalidateSettings)

  const supplierDebtLimit = useSettingSave(async (amount: number) => {
    const response = await adminControllerUpdateSupplierDebtLimit({ body: { amount } })
    if (response.error)
      throw new Error('Failed to update supplier debt limit')
    return response.data
  }, invalidateSettings)

  const deliveryPricing = useSettingSave(async (config: DeliveryPricingConfig) => {
    const response = await adminDeliveryPricingControllerUpdate({ body: config })
    if (response.error)
      throw new Error('Failed to update delivery pricing')
    return response.data as DeliveryPricingConfig
  }, (saved) => {
    queryClient.setQueryData(['admin', 'delivery-pricing'], saved)
  })

  const referralRewards = useSettingSave(async (rewards: ReferralRewardsFormData) => {
    const response = await adminReferralRewardsControllerUpdate({ body: rewards })
    if (response.error)
      throw new Error('Failed to update referral rewards')
    return response.data as ReferralRewardsFormData
  }, (saved) => {
    queryClient.setQueryData(['admin', 'referral-rewards'], saved)
  })

  const bannerOffers = useSettingSave(async (offers: BannerOffers) => {
    const response = await adminBannerOffersControllerUpdate({ body: offers })
    if (response.error)
      throw new Error('Failed to update banner offers')
    return response.data as BannerOffers
  }, (saved) => {
    queryClient.setQueryData(['admin', 'banner-offers'], saved)
  })

  // The switch and the identity share one route, so every call carries the
  // current `enabled`: saving a name must never close her by omission.
  const assistant = useSettingSave(async (input: Partial<AssistantSetting> & { enabled: boolean }) => {
    const response = await adminAssistantControllerUpdate({
      body: {
        enabled: input.enabled,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.voiceSpeed !== undefined ? { voiceSpeed: input.voiceSpeed } : {}),
      },
    })
    if (response.error)
      throw new Error('Failed to update assistant setting')
    return response.data as AssistantSetting
  }, (saved) => {
    queryClient.setQueryData(['admin', 'assistant'], saved)
  })

  const escrowRelease = useSettingSave(async (delays: EscrowReleaseFormData) => {
    const result = await client.put({ url: '/api/admin/escrow-release', body: delays })
    if (result.error)
      throw new Error('Failed to update escrow release delays')
    return result.data as EscrowReleaseFormData
  }, (saved) => {
    queryClient.setQueryData(['admin', 'escrow-release'], saved)
  })

  const newProducts = useSettingSave(async (body: NewProductSettings) => {
    const response = await adminNewProductSettingsControllerUpdate({ body })
    if (response.error)
      throw new Error('Failed to update new product settings')
    return response.data as NewProductSettings
  }, (saved) => {
    queryClient.setQueryData(['admin', 'new-products'], saved)
  })

  const reviewTiming = useSettingSave(async (timing: ProductReviewTiming) => {
    const response = await adminProductReviewTimingControllerUpdate({ body: timing })
    if (response.error)
      throw new Error('Failed to update product review timing')
    return response.data as ProductReviewTiming
  }, (saved) => {
    queryClient.setQueryData(['admin', 'product-review-timing'], saved)
  })

  const { mutate: saveExchangeRates, isPending: isFxPending } = useMutation({
    mutationFn: (update: ExchangeRatesUpdate) => updateExchangeRates(update),
    onMutate: () => {
      setFxFeedback(null)
    },
    onSuccess: () => {
      setFxFeedback('saved')
      queryClient.invalidateQueries({ queryKey: EXCHANGE_RATES_QUERY_KEY })
    },
    onError: () => {
      setFxFeedback('error')
      queryClient.invalidateQueries({ queryKey: EXCHANGE_RATES_QUERY_KEY })
    },
  })

  const { mutate: refreshRates, isPending: isFxRefreshing } = useMutation({
    mutationFn: refreshExchangeRates,
    onMutate: () => {
      setFxFeedback(null)
    },
    onSuccess: (result) => {
      setFxFeedback(result.refreshed ? 'refreshed' : 'notRefreshed')
      const data: ExchangeRatesData = { marginBps: result.marginBps, rates: result.rates }
      queryClient.setQueryData(EXCHANGE_RATES_QUERY_KEY, data)
    },
    onError: () => {
      setFxFeedback('refreshError')
    },
  })

  const isAnyLoading = [
    settingsQuery,
    pricingQuery,
    bannerOffersQuery,
    referralQuery,
    assistantQuery,
    reviewQuery,
    escrowQuery,
    newProductsQuery,
    fxQuery,
  ].some(query => query.isLoading)

  return {
    isAnyLoading,
    settings: settingsQuery.data,
    isSettingsLoading: settingsQuery.isLoading,
    commissions: {
      save: (rates: Array<{ category: string, rate: number }>) => updateCommissions(rates),
      isPending: isCommissionsPending,
    },
    deliveryCommission,
    cashLimit,
    debtLimit,
    supplierDebtLimit,
    offerTimeout,
    pickupPolicy,
    deliveryPricing: { ...deliveryPricing, data: pricingQuery.data, isLoading: pricingQuery.isLoading },
    referralRewards: { ...referralRewards, data: referralQuery.data, isLoading: referralQuery.isLoading },
    bannerOffers: { ...bannerOffers, data: bannerOffersQuery.data, isLoading: bannerOffersQuery.isLoading },
    assistant: { ...assistant, data: assistantQuery.data, isLoading: assistantQuery.isLoading },
    escrowRelease: { ...escrowRelease, data: escrowQuery.data, isLoading: escrowQuery.isLoading },
    newProducts: { ...newProducts, data: newProductsQuery.data, isLoading: newProductsQuery.isLoading },
    reviewTiming: { ...reviewTiming, data: reviewQuery.data, isLoading: reviewQuery.isLoading },
    exchangeRates: {
      data: fxQuery.data,
      isLoading: fxQuery.isLoading,
      save: (update: ExchangeRatesUpdate) => saveExchangeRates(update),
      isPending: isFxPending,
      refresh: () => refreshRates(),
      isRefreshing: isFxRefreshing,
      feedback: fxFeedback,
    },
  }
}

export type AdminSettingsState = ReturnType<typeof useAdminSettings>
