import { Migrator } from '@mikro-orm/migrations'

import { defineConfig, Options, ReflectMetadataProvider } from '@mikro-orm/postgresql'
import { TsMorphMetadataProvider } from '@mikro-orm/reflection'
import { SeedManager } from '@mikro-orm/seeder'

// This file is used by the mikro-orm CLI for migrations and seeding
import { config } from './env.config'

// Add openapi method to ZodType prototype to avoid errors while running migrations
// PostGIS columns require type override to avoid schema drift

type CreateMikroOrmOptions = {
  isTest?: boolean
} & Options

export function createMikroOrmOptions(options?: CreateMikroOrmOptions) {
  const { ...restOptions } = options ?? {}

  const _options: Options = defineConfig({
    entities: ['./dist/**/*.entity.js'],
    entitiesTs: ['./src/**/*.entity.ts'],
    dbName: config.database.name,
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    // Each `@SingleInstance` job holds one connection for its lock while it runs
    // and needs another for its queries. A dozen fire together every ten
    // minutes: with knex's default of 10 they took every connection, waited on
    // each other and blocked the whole API until the 60 s acquire timeout.
    // Keep this well above the number of scheduled jobs.
    pool: { min: 2, max: 30 },
    metadataProvider: __filename.endsWith('.js') ? ReflectMetadataProvider : TsMorphMetadataProvider,
    forceUtcTimezone: true,
    debug: config.env === 'development',
    extensions: [SeedManager, Migrator],
    seeder: {
      path: './dist/seeders',
      pathTs: './src/seeders',
      defaultSeeder: 'DatabaseSeeder',
      glob: '!(*.d).{js,ts}',
      emit: 'ts',
      fileName: (className: string) => className,
    },
    migrations: {
      path: './dist/modules/db/migrations',
      pathTs: './src/modules/db/migrations',
      allOrNothing: false,
      disableForeignKeys: false,
    },
    ...restOptions,
  })

  return _options
}

export function createTestMikroOrmOptions(options?: Options) {
  return createMikroOrmOptions({ isTest: true, ...options })
}
export default createMikroOrmOptions
