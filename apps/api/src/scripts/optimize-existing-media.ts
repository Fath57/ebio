import { MikroORM } from '@mikro-orm/postgresql'
import { Logger } from '@nestjs/common'
import { createMikroOrmOptions } from '../config/mikro-orm.config'
import { s3Config } from '../config/s3.config'
import { Media, MediaStatus, MediaType } from '../modules/media/media.entity'
import { MediaService } from '../modules/media/media.service'

/**
 * One-shot migration: optimizes every image uploaded before sharp processing
 * existed (resize + WebP + thumbnail), then rewrites the denormalized URLs
 * stored on products, suppliers, categories, banners, publications, messages
 * and trainings so every consumer serves the light version.
 *
 * Build first, then run from apps/api:
 *   pnpm build && npx dotenvx run -- node dist/scripts/optimize-existing-media.js
 *
 * Idempotent: already-processed images (thumbnailKey set) are skipped.
 */
const logger = new Logger('OptimizeExistingMedia')

// Tables holding a denormalized copy of media.publicUrl. jsonb array columns
// are rewritten by string replacement (URLs contain a UUID, no collision risk).
const URL_COLUMNS: { table: string, column: string, jsonb?: boolean }[] = [
  { table: 'products', column: 'photos', jsonb: true },
  { table: 'publications', column: 'media_urls', jsonb: true },
  { table: 'suppliers', column: 'cover_photo' },
  { table: 'suppliers', column: 'profile_photo' },
  { table: 'categories', column: 'image_url' },
  { table: 'banners', column: 'image_url' },
  { table: 'messages', column: 'media_url' },
  { table: 'training_modules', column: 'thumbnail_url' },
]

async function main() {
  const orm = await MikroORM.init(createMikroOrmOptions())
  const em = orm.em.fork()
  const service = new MediaService(em)

  const pending = await em.find(Media, {
    type: MediaType.IMAGE,
    status: MediaStatus.READY,
    thumbnailKey: null,
  }, { orderBy: { createdAt: 'ASC' } })

  logger.log(`${pending.length} image(s) à optimiser`)

  let done = 0
  let failed = 0
  let bytesBefore = 0
  let bytesAfter = 0
  const connection = em.getConnection()

  for (const media of pending) {
    const oldUrl = media.publicUrl
    try {
      await service.optimizeImage(media)
      media.publicUrl = `${s3Config.publicUrl}/${media.optimizedKey ?? media.s3Key}`
      await em.flush()

      bytesBefore += media.originalSize
      bytesAfter += media.optimizedSize ?? media.originalSize

      if (oldUrl && oldUrl !== media.publicUrl) {
        for (const { table, column, jsonb } of URL_COLUMNS) {
          if (jsonb) {
            await connection.execute(
              `update ${table} set ${column} = replace(${column}::text, ?, ?)::jsonb where ${column}::text like ?`,
              [oldUrl, media.publicUrl, `%${oldUrl}%`],
            )
          }
          else {
            await connection.execute(
              `update ${table} set ${column} = ? where ${column} = ?`,
              [media.publicUrl, oldUrl],
            )
          }
        }
      }

      done++
      if (done % 20 === 0) {
        logger.log(`${done}/${pending.length}…`)
      }
    }
    catch (error) {
      failed++
      logger.error(`Échec pour ${media.id} (${media.s3Key}): ${(error as Error).message}`)
    }
  }

  const savedMb = ((bytesBefore - bytesAfter) / 1024 / 1024).toFixed(1)
  logger.log(`Terminé : ${done} optimisée(s), ${failed} échec(s), ${savedMb} Mo économisés`)
  await orm.close()
}

main().catch((error) => {
  logger.error(error)
  process.exit(1)
})
