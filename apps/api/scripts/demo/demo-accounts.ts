/** Password of every demo account, filmed, never a real one. */
export const DEMO_PASSWORD = 'Demo2026!'

/** Delivery code of every demo run, the buyer would read it from their app. */
export const DEMO_DELIVERY_CODE = '2468'

/**
 * Every one-time code drawn on the demo database (SMS sign-up and login,
 * e-mail sign-up, password reset, address change): a scripted take types it,
 * no SMS or e-mail reaching anyone. Set by a trigger, see seed-demo.ts.
 */
export const DEMO_OTP_CODE = '246810'

/** The diaspora buyer of the « Valise du pays » video, in France. */
export const DEMO_DIASPORA_BUYER = {
  name: 'Sika Mensah',
  email: 'sika@demo.e-bio.org',
  // ARCEP range reserved for fiction (06 39 98 xx xx): allocated to nobody.
  phone: '+33639980001',
  walletBalance: 150_000,
}

/** Accounts the auth video signs up on camera: absent from the demo until then. */
export const AUTH_TAKE_ACCOUNTS = {
  phone: { name: 'Codjo Ahouandjinou', phone: '+2290197000000' },
  email: { name: 'Nadia Kpadé', email: 'nadia@demo.e-bio.org' },
}
