import {
  subscriptionsControllerCancelSubscription,
  subscriptionsControllerGetCurrentSubscription,
  subscriptionsControllerGetPlans,
  subscriptionsControllerUpgradeSubscription,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface CurrentPlanData {
  name: string
  price: number
  renewalDate: string | null
  planId: string
}

export interface PlanItem {
  id: string
  name: string
  price: number
  features: string[]
}

export interface PlansData {
  data: PlanItem[]
}

export function fetchCurrentPlanQueryOptions() {
  return {
    queryKey: ['subscription', 'current'],
    queryFn: async () => {
      const response = await subscriptionsControllerGetCurrentSubscription()
      if (response.error)
        throw new Error('Failed to fetch current subscription')
      return response.data as CurrentPlanData
    },
  }
}

export function fetchPlansQueryOptions() {
  return {
    queryKey: ['subscription', 'plans'],
    queryFn: async () => {
      const response = await subscriptionsControllerGetPlans()
      if (response.error)
        throw new Error('Failed to fetch plans')
      return response.data as PlansData
    },
  }
}

export const upgradePlanMutationOptions = {
  mutationFn: async (planId: string) => {
    const response = await subscriptionsControllerUpgradeSubscription({
      body: { newPlanId: planId },
    })
    if (response.error)
      throw new Error('Failed to upgrade plan')
    return response.data
  },
}

export const cancelPlanMutationOptions = {
  mutationFn: async () => {
    const response = await subscriptionsControllerCancelSubscription()
    if (response.error)
      throw new Error('Failed to cancel plan')
    return response.data
  },
}
