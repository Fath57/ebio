import { MikroORM } from '@mikro-orm/postgresql'
import { Logger } from '@nestjs/common'
import { createMikroOrmOptions } from '../config/mikro-orm.config'

/**
 * Applique une migration nommée, en production.
 *
 * Le CLI `mikro-orm` ne découvre pas les entités dans l'image déployée — il
 * cherche des sources TypeScript qui n'y sont pas — et chaque migration se
 * terminait en bricolage. Ce script part de la configuration compilée, celle
 * que l'API utilise elle-même, et n'a donc rien à découvrir.
 *
 * Une migration à la fois, nommée : le registre de production est désaligné
 * de l'historique local, et un `migration:up` nu rejouerait des migrations
 * déjà appliquées à la main.
 *
 * Usage : node dist/scripts/migrate-up.js Migration20260928020000
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
