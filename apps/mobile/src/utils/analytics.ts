import type PostHog from 'posthog-react-native'
import { APP_VARIANT } from './app-variant'

/**
 * What the app is allowed to say about how it is used.
 *
 * Everything goes through here and never through the vendor's own object.
 * Two reasons: the tool can be replaced without touching a single screen, and
 * there is exactly one place where consent, or its absence, is respected.
 *
 * Without a key the whole thing is inert — no client is created, nothing
 * leaves the phone. A build that was never given one measures nothing, which
 * is what a developer wants and what a test environment needs.
 */

/**
 * Where the refusal is remembered.
 *
 * On the device and not on the account: someone who refuses before signing
 * in has refused, and asking again after they log in would make the refusal
 * conditional on something they never agreed to.
 */
export const ANALYTICS_CONSENT_KEY = 'ebio_analytics_refuse'

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? ''
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'

/**
 * The events worth having, and no others.
 *
 * A list of ten answers questions; a list of two hundred answers none, costs
 * data on every phone, and nobody ever reads it. Each one here exists because
 * a decision depends on it.
 */
export type AnalyticsEvent
  /** Someone searched — and, crucially, whether anything came back. */
  = | 'recherche'
    | 'produit_vu'
    | 'panier_ajout'
    | 'caisse_ouverte'
  /** With its reason: this is the funnel's leak, seen from the phone. */
    | 'caisse_refusee'
    | 'commande_passee'
    | 'assistant_ouvert'
    | 'campagne_ouverte'

let client: PostHog | null = null
let started = false
let allowed = true

/** Started once, lazily: an app that never measures never loads the library. */
async function ensureClient(): Promise<PostHog | null> {
  if (!KEY || !allowed) {
    return null
  }
  if (client || started) {
    return client
  }
  started = true
  try {
    const { default: PostHogClient } = await import('posthog-react-native')
    client = new PostHogClient(KEY, {
      host: HOST,
      // Screens and taps are captured explicitly, below: automatic capture
      // names things after component trees, which nobody can read six months
      // later and which changes every refactor.
      captureAppLifecycleEvents: true,
      flushAt: 20,
      // Batched generously: every send costs data on a metered connection,
      // and nothing here is urgent.
      flushInterval: 60_000,
    })
    client.register({ app: APP_VARIANT })
    return client
  }
  catch {
    // A build without the native modules, or a bad key. Measuring is never
    // worth breaking the app for.
    client = null
    return null
  }
}

/**
 * What an event may carry.
 *
 * Plain values only, and no free-form objects: a property that nests is a
 * property nobody can group by, and it is how personal data ends up in an
 * event by accident.
 */
export type EventProperties = Record<string, string | number | boolean | null>

/** Records one thing that happened. Never throws, never blocks a screen. */
export function track(event: AnalyticsEvent, properties?: EventProperties): void {
  void ensureClient().then((posthog) => {
    posthog?.capture(event, properties)
  }).catch(() => {
    // Measuring is not worth an error the user would see.
  })
}

/** A screen was shown. Named by us, not derived from the component tree. */
export function trackScreen(name: string): void {
  void ensureClient().then((posthog) => {
    posthog?.screen(name)
  }).catch(() => {
    // Same: silence.
  })
}

/**
 * Ties what follows to a person.
 *
 * Called on sign-in. This is what turns a stream of anonymous taps into
 * "this buyer could not check out twice" — and what makes it personal data,
 * which is why `forget` below matters as much.
 */
export function identify(userId: string): void {
  void ensureClient().then((posthog) => {
    posthog?.identify(userId, { app: APP_VARIANT })
  }).catch(() => {
    // Silence.
  })
}

/** Called on sign-out: what follows belongs to whoever comes next, not to them. */
export function forget(): void {
  void ensureClient().then((posthog) => {
    posthog?.reset()
  }).catch(() => {
    // Silence.
  })
}

/**
 * Someone refused to be measured.
 *
 * Stops the client and forgets what it held. Checked before anything is
 * created, so a refusal given before first use means no client is ever built.
 */
export function setAnalyticsAllowed(value: boolean): void {
  allowed = value
  if (!value && client) {
    void client.optOut()
    client.reset()
  }
  if (value && client) {
    void client.optIn()
  }
}
