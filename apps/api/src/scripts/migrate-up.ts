import { MikroORM } from '@mikro-orm/postgresql'
import { Logger } from '@nestjs/common'
import { createMikroOrmOptions } from '../config/mikro-orm.config'

/**
 * Applies one named migration, in production.
 *
 * The `mikro-orm` CLI discovers no entity in the deployed image — it looks
 * for TypeScript sources that are not there — and every migration ended in
 * fiddling on the server. This script starts from the compiled config, the
 * one the API itself uses, so it has nothing to discover.
 *
 * One migration at a time, named: the production ledger is out of step with
 * the local history, and a bare `migration:up` would replay migrations
 * already applied by hand.
 *
 * Usage: node dist/scripts/migrate-up.js Migration20260928020000
 */
async function main(): Promise<void> {
  const logger = new Logger('migrate-up')
  const name = process.argv[2]
  if (!name) {
    logger.error('Nom de migration attendu — ex. Migration20260928020000')
    process.exitCode = 1
    return
  }

  const orm = await MikroORM.init(createMikroOrmOptions())
  try {
    const migrator = orm.getMigrator()
    const applied = await migrator.getExecutedMigrations()
    if (applied.some(item => item.name.startsWith(name))) {
      logger.log(`${name} est déjà appliquée — rien à faire`)
      return
    }

    const pending = await migrator.getPendingMigrations()
    if (!pending.some(item => item.name.startsWith(name))) {
      logger.error(`${name} est introuvable parmi les migrations en attente`)
      process.exitCode = 1
      return
    }

    await migrator.up({ migrations: [name] })
    logger.log(`${name} appliquée`)
  }
  finally {
    await orm.close(true)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
