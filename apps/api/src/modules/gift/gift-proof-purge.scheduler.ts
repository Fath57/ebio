import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SingleInstance } from '../db/cron-lock'
import { MediaService } from '../media/media.service'

/** The hand-over photo of a cart sent to a relative is kept this long (FR-017). */
export const GIFT_PROOF_RETENTION_DAYS = 90

/** Per run: a backlog drains over a few nights rather than in one long job. */
const BATCH_SIZE = 200

/**
 * Deletes the hand-over photos of carts delivered to a relative more than
 * 90 days ago. The photo shows someone's door and face: it is kept for
 * disputes, not forever. Position, time and distance stay for the record;
 * only the picture goes, and `proof_media_id` with it.
 */
@Injectable()
export class GiftProofPurgeScheduler {
  private readonly logger = new Logger(GiftProofPurgeScheduler.name)

  constructor(
    // Read by @EnsureRequestContext to fork a context for the cron run.
    private readonly em: EntityManager,
    private readonly media: MediaService,
  ) {}

  @Cron('30 3 * * *')
  @SingleInstance()
  @EnsureRequestContext()
  async purgeDaily(): Promise<void> {
    await this.purge()
  }

  /** Returns how many photos were removed. */
  async purge(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - GIFT_PROOF_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const rows = await this.em.getConnection().execute(
      `SELECT d.id, d.proof_media_id
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       JOIN checkouts c ON c.id = o.checkout_id
       WHERE c.recipient_phone IS NOT NULL
         AND d.status = 'DELIVERED'
         AND d.delivered_at < ?
         AND d.proof_media_id IS NOT NULL
       ORDER BY d.delivered_at
       LIMIT ?`,
      [cutoff, BATCH_SIZE],
    ) as Array<{ id: string, proof_media_id: string }>

    let purged = 0
    for (const row of rows) {
      try {
        await this.media.deleteMedia(row.proof_media_id)
      }
      catch (error) {
        // Already gone: the link is cleared all the same. Anything else is
        // retried tomorrow, the link left in place so the photo is not orphaned.
        if (!(error instanceof NotFoundException)) {
          this.logger.warn(`Photo de remise ${row.proof_media_id} non supprimée : ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
      }
      await this.em.getConnection().execute(
        `UPDATE deliveries SET proof_media_id = NULL, "updatedAt" = NOW() WHERE id = ?`,
        [row.id],
      )
      purged += 1
    }
    if (purged > 0) {
      this.logger.log(`${purged} photo(s) de remise supprimée(s) après ${GIFT_PROOF_RETENTION_DAYS} jours`)
    }
    return purged
  }
}
