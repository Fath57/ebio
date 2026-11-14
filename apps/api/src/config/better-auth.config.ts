import type { JWTVerifyGetKey } from 'jose'
import { betterAuth, BetterAuthOptions, MiddlewareInputContext, MiddlewareOptions, User } from 'better-auth'
import { bearer, openAPI } from 'better-auth/plugins'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Pool } from 'pg'

// Kept in this file: the web app type-checks it (session types), and a
// relative import would fall outside its rootDir.
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/**
 * Checks a Google ID token against every client the apps sign in with.
 *
 * Better Auth only accepts its single `clientId` as audience, the web client.
 * Android tokens carry it, but Google issues an iPhone's token for the app's
 * own iOS client, so every iOS sign-in was refused. Same checks otherwise:
 * Google's keys, issuer, freshness and the nonce when one was sent.
 */
export function createGoogleIdTokenVerifier(audiences: string[], keys: JWTVerifyGetKey = GOOGLE_JWKS) {
  return async (token: string, nonce?: string): Promise<boolean> => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: GOOGLE_ISSUERS,
        audience: audiences,
        maxTokenAge: '1h',
      })
      return !nonce || payload.nonce === nonce
    }
    catch {
      return false
    }
  }
}

interface BetterAuthOptionsDynamic {
  secret: string
  trustedOrigins: string[]
  connectionStringUrl: string
  sendResetPassword?: (
    data: { user: User, url: string, token: string },
    request: Request | undefined,
  ) => Promise<void>
  sendVerificationEmail?: (
    data: { user: User, url: string, token: string },
    request: Request | undefined,
  ) => Promise<void>
  beforeHook?: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<unknown>)
  afterHook?: ((inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<unknown>)
  databaseHooks?: BetterAuthOptions['databaseHooks']
  baseUrl: string
  googleClientId?: string
  googleClientSecret?: string
  /** iOS OAuth clients: an iPhone's Google token is issued for these, not the web client. */
  googleIosClientIds: string[]
  /** Bundle identifiers of the iOS apps allowed to sign in with Apple. */
  appleBundleIds: string[]
}

// We should use this, but sadly we do not have our custom fields in the session object (only the plugin added fields)
// https://github.com/better-auth/better-auth/issues/2818
// export type BetterAuthSession = ReturnType<typeof createAuth>['$Infer']['Session']

// My workaround to get the session type
export type BetterAuthSession = Awaited<ReturnType<ReturnType<typeof createBetterAuth>['api']['getSession']>>
export type LoggedInBetterAuthSession = NonNullable<BetterAuthSession>

export type BetterAuthType = ReturnType<typeof createBetterAuth>
/**
 * The context type for BetterAuth middleware.
 * This type is derived from the first parameter of the $context method of BetterAuthType.
 */
export type BetterAuthContext = ReturnType<typeof createBetterAuth>['$context']

const LAN_IP_PATTERN = /^https?:\/\/(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/

function buildTrustedOrigins(staticOrigins: string[]) {
  if (process.env.NODE_ENV === 'production')
    return staticOrigins
  return (request?: Request): string[] => {
    const origin = request?.headers?.get?.('origin') ?? null
    if (origin && LAN_IP_PATTERN.test(origin) && !staticOrigins.includes(origin)) {
      return [...staticOrigins, origin]
    }
    return staticOrigins
  }
}

export function createBetterAuth(options: BetterAuthOptionsDynamic) {
  const authOptions = {
    baseURL: options.baseUrl,
    secret: options.secret,
    trustedOrigins: buildTrustedOrigins(options.trustedOrigins),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      sendResetPassword: async (data, request) => {
        if (!options?.sendResetPassword)
          return
        return options?.sendResetPassword?.(data, request)
      },
    },
    socialProviders: {
      ...(options.googleClientId && options.googleClientSecret
        ? {
            google: {
              clientId: options.googleClientId,
              clientSecret: options.googleClientSecret,
              verifyIdToken: createGoogleIdTokenVerifier([options.googleClientId, ...options.googleIosClientIds]),
            },
          }
        : {}),
      // Native Sign in with Apple only: the app hands over the identity token
      // and Better Auth checks it against Apple's keys, with the bundle id as
      // audience. No secret is involved, that one only serves the web
      // redirect flow, which the apps never use.
      ...(options.appleBundleIds.length > 0
        ? {
            apple: {
              clientId: options.appleBundleIds[0]!,
              clientSecret: '',
              audience: options.appleBundleIds,
            },
          }
        : {}),
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: 60 * 60 * 24 * 10, // 10 days
      sendVerificationEmail: async (data, request) => {
        if (!options?.sendVerificationEmail)
          return
        return options?.sendVerificationEmail?.(data, request)
      },
    },
    database: new Pool({
      connectionString: options.connectionStringUrl,
    }),
    databaseHooks: options.databaseHooks,
    advanced: {
      database: {
        generateId: false,
      },
    },
    user: {
      modelName: 'users',
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'BUYER',
          input: false,
        },
        phone: {
          type: 'string',
          required: false,
          input: false,
        },
        // Account standing rides on the session so AuthGuard needs no extra query.
        status: {
          type: 'string',
          defaultValue: 'ACTIVE',
          input: false,
        },
        statusReason: {
          type: 'string',
          required: false,
          input: false,
          fieldName: 'status_reason',
        },
        suspendedUntil: {
          type: 'date',
          required: false,
          input: false,
          fieldName: 'suspended_until',
        },
      },
    },
    rateLimit: {
      window: 50,
      max: 100,
    },
    hooks: {
      before: options?.beforeHook,
      after: options?.afterHook,
    },
    plugins: [
      openAPI(),
      // iOS does not hand the Set-Cookie header to JavaScript, so the app
      // only ever sees the bare session token from the response body. This
      // plugin accepts that token as `Authorization: Bearer` and returns the
      // signed one in a readable `set-auth-token` header.
      bearer(),
    ],

  } satisfies BetterAuthOptions

  // We need to pass the options to the customSession plugin to infer the type correctly
  // If you don't do this, you will not have the properties added by plugins (ex. session.activeOrganizationId for the organization plugin)
  // See https://www.better-auth.com/docs/concepts/session-management#customizing-session-response
  return betterAuth({
    ...authOptions,
    plugins: [
      ...(authOptions.plugins ?? []),
    ],

  })
}
