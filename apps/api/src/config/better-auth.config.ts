import { betterAuth, BetterAuthOptions, MiddlewareInputContext, MiddlewareOptions, User } from 'better-auth'
import { openAPI } from 'better-auth/plugins'
import { Pool } from 'pg'

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
