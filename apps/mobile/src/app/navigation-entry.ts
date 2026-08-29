import type { ComponentType } from 'react'

// Variant-aware navigation entry. EXPO_PUBLIC_APP_VARIANT is inlined by
// babel-preset-expo at build time, so in production bundles the two unused
// branches — and every feature module they import — are dead-code eliminated.
const variant = process.env.EXPO_PUBLIC_APP_VARIANT ?? 'client'

function resolveNavigation(): ComponentType {
  if (variant === 'supplier') {
    return require('./navigation.supplier').SupplierNavigation
  }
  if (variant === 'courier') {
    return require('./navigation.courier').CourierNavigation
  }
  return require('./navigation.client').ClientNavigation
}

export const AppNavigation: ComponentType = resolveNavigation()
