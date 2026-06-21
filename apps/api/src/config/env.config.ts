import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import dotenvx from '@dotenvx/dotenvx'
import { z } from 'zod'

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development'
if (nodeEnv === 'test') {
  dotenvx.config({ path: join(process.cwd(), '.env.example') })
}
else {
  dotenvx.config()
}

function getVersion() {
  const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf8')

  if (!packageJson) {
    console.warn('Failed to read package.json')
    return 'Unknown version'
  }

  try {
    const packageJsonData = JSON.parse(packageJson)

    return packageJsonData.version ?? 'Unknown version'
  }
  catch {
    console.warn('Failed to parse package.json version')
    return 'Unknown version'
  }
}

export const configValidationSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // API
  API_BASE_URL: z.url(),
  API_PORT: z.coerce.number(),

  // Database
  DATABASE_PASSWORD: z.string(),
  DATABASE_USER: z.string(),
  DATABASE_NAME: z.string(),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.coerce.number(),

  // BetterAuth
  BETTER_AUTH_SECRET: z.string(),
  TRUSTED_ORIGINS: z.string().transform(val => val.split(',')),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),

  // Clients
  CLIENTS_WEB_APP_URL: z.string(),
  CLIENTS_WEB_SSR_URL: z.string(),

  // Email
  EMAIL_HOST: z.string().default('localhost'),
  EMAIL_PORT: z.coerce.number().default(1025),
  EMAIL_SECURE: z.stringbool().default(false),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@ebio.app'),

  // AI Providers
  OPENAI_API_KEY: z.string().optional(), // OpenAI
  ANTHROPIC_API_KEY: z.string().optional(), // Anthropic
  GOOGLE_API_KEY: z.string().optional(), // Google
  MISTRAL_API_KEY: z.string().optional(), // Mistral

  // Langfuse
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(), // Optional
  LANGFUSE_BASE_URL: z.string().optional(), // Optional, defaults to cloud

  // Sentry
  SENTRY_DSN: z.string().optional(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // S3 / Cloudflare R2 / MinIO
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('ebio'),
  S3_REGION: z.string().default('auto'),
  S3_PUBLIC_URL: z.string().default('http://localhost:9000/ebio'),

  // FedaPay
  FEDAPAY_API_KEY: z.string().optional(),
  FEDAPAY_PUBLIC_KEY: z.string().optional(),
  FEDAPAY_WEBHOOK_SECRET: z.string().optional(),
  FEDAPAY_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // PawerPayer
  PAWERPAYER_API_KEY: z.string().optional(),
  PAWERPAYER_API_URL: z.string().optional(),

  // SMS (Africa's Talking)
  AT_API_KEY: z.string().optional(),
  AT_USERNAME: z.string().optional(),
  AT_SENDER_ID: z.string().default('eBio'),

  // Firebase Cloud Messaging
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().default('dev-jwt-secret'),
  JWT_REFRESH_SECRET: z.string().default('dev-jwt-refresh-secret'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
})

export type ConfigSchema = z.infer<typeof configValidationSchema>

const configParsed = configValidationSchema.safeParse(process.env)

if (!configParsed.success) {
  throw new Error(
    `Invalid environment variables: ${JSON.stringify(
      z.treeifyError(configParsed.error),
      null,
      4,
    )}`,
  )
}

export const config = {
  env: configParsed.data.NODE_ENV,
  api: {
    baseUrl: configParsed.data.API_BASE_URL,
    port: configParsed.data.API_PORT,
  },
  version: getVersion(),
  betterAuth: {
    secret: configParsed.data.BETTER_AUTH_SECRET,
    trustedOrigins: configParsed.data.TRUSTED_ORIGINS,
    google: {
      clientId: configParsed.data.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: configParsed.data.GOOGLE_OAUTH_CLIENT_SECRET,
    },
  },
  database: {
    password: configParsed.data.DATABASE_PASSWORD,
    user: configParsed.data.DATABASE_USER,
    name: configParsed.data.DATABASE_NAME,
    host: configParsed.data.DATABASE_HOST,
    port: configParsed.data.DATABASE_PORT,
    connectionStringUrl: `postgresql://${configParsed.data.DATABASE_USER}:${configParsed.data.DATABASE_PASSWORD}@${configParsed.data.DATABASE_HOST}:${configParsed.data.DATABASE_PORT}/${configParsed.data.DATABASE_NAME}`,
  },
  email: {
    host: configParsed.data.EMAIL_HOST,
    port: configParsed.data.EMAIL_PORT,
    secure: configParsed.data.EMAIL_SECURE,
    user: configParsed.data.EMAIL_USER,
    password: configParsed.data.EMAIL_PASSWORD,
    from: configParsed.data.EMAIL_FROM,
  },
  clients: {
    webApp: {
      url: configParsed.data.CLIENTS_WEB_APP_URL,
    },
    webSsr: {
      url: configParsed.data.CLIENTS_WEB_SSR_URL,
    },
  },
  langfuse: {
    secretKey: configParsed.data.LANGFUSE_SECRET_KEY,
    publicKey: configParsed.data.LANGFUSE_PUBLIC_KEY,
    host: configParsed.data.LANGFUSE_BASE_URL,
  },
  ai: {
    providers: {
      openai: {
        apiKey: configParsed.data.OPENAI_API_KEY,
      },
      anthropic: {
        apiKey: configParsed.data.ANTHROPIC_API_KEY,
      },
      google: {
        apiKey: configParsed.data.GOOGLE_API_KEY,
      },
      mistral: {
        apiKey: configParsed.data.MISTRAL_API_KEY,
      },
    },
  },
  sentry: {
    dsn: configParsed.data.SENTRY_DSN,
  },
  redis: {
    url: configParsed.data.REDIS_URL,
  },
  s3: {
    endpoint: configParsed.data.S3_ENDPOINT,
    accessKey: configParsed.data.S3_ACCESS_KEY,
    secretKey: configParsed.data.S3_SECRET_KEY,
    bucket: configParsed.data.S3_BUCKET,
    region: configParsed.data.S3_REGION,
    publicUrl: configParsed.data.S3_PUBLIC_URL,
  },
  payments: {
    fedapay: {
      apiKey: configParsed.data.FEDAPAY_API_KEY,
      publicKey: configParsed.data.FEDAPAY_PUBLIC_KEY,
      webhookSecret: configParsed.data.FEDAPAY_WEBHOOK_SECRET,
      environment: configParsed.data.FEDAPAY_ENVIRONMENT,
    },
    stripe: {
      secretKey: configParsed.data.STRIPE_SECRET_KEY,
      webhookSecret: configParsed.data.STRIPE_WEBHOOK_SECRET,
    },
    pawerpayer: {
      apiKey: configParsed.data.PAWERPAYER_API_KEY,
      apiUrl: configParsed.data.PAWERPAYER_API_URL,
    },
  },
  fedapay: {
    apiKey: configParsed.data.FEDAPAY_API_KEY,
    webhookSecret: configParsed.data.FEDAPAY_WEBHOOK_SECRET,
    environment: configParsed.data.FEDAPAY_ENVIRONMENT,
  },
  sms: {
    apiKey: configParsed.data.AT_API_KEY,
    username: configParsed.data.AT_USERNAME,
    senderId: configParsed.data.AT_SENDER_ID,
  },
  fcm: {
    projectId: configParsed.data.FCM_PROJECT_ID,
    clientEmail: configParsed.data.FCM_CLIENT_EMAIL,
    privateKey: configParsed.data.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  jwt: {
    secret: configParsed.data.JWT_SECRET,
    refreshSecret: configParsed.data.JWT_REFRESH_SECRET,
    accessExpiry: configParsed.data.JWT_ACCESS_EXPIRY,
    refreshExpiry: configParsed.data.JWT_REFRESH_EXPIRY,
  },
} as const
