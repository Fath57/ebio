/**
 * Build-time app variant (client | supplier | courier). EXPO_PUBLIC_APP_VARIANT
 * is inlined by babel-preset-expo, so comparisons against it fold at build time.
 */
export type AppVariant = 'client' | 'supplier' | 'courier'

export const APP_VARIANT: AppVariant = (process.env.EXPO_PUBLIC_APP_VARIANT as AppVariant | undefined) ?? 'client'

/** Server-side notification audience matching this app (see NotificationsService). */
export const NOTIFICATION_AUDIENCE = APP_VARIANT === 'client' ? 'buyer' : APP_VARIANT

/**
 * Brand logo of this app (transparent PNG). Static `require` calls keep Metro
 * happy; the dead branches disappear at build time with the inlined variant.
 */
export const BRAND_LOGO = APP_VARIANT === 'supplier'
  ? require('../../assets/logo-transparent-supplier.png')
  : APP_VARIANT === 'courier'
    ? require('../../assets/logo-transparent-courier.png')
    : require('../../assets/logo-transparent.png')
