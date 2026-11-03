import { Platform } from 'react-native'

/**
 * Paid advertising (home banner, opening announcement) is a digital service:
 * on iOS, Apple wants it sold through in-app purchase (guideline 3.1.1). The
 * iPhone app leaves it out, and shops order it from the web back-office
 * instead. Android keeps it.
 */
export const CAN_SELL_ADS_IN_APP = Platform.OS !== 'ios'
