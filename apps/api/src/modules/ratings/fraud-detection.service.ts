import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { Review } from './entities/review.entity'

interface SuspiciousAccount {
  userId: string
  name: string
  sharedDeviceId: string
}

interface FraudDetectionResult {
  isSuspicious: boolean
  sharedAccounts: SuspiciousAccount[]
}

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name)

  constructor(private readonly em: EntityManager) {}

  async detectMultipleAccounts(userId: string): Promise<FraudDetectionResult> {
    const user = await this.em.findOne(User, { id: userId })
    if (!user?.deviceId) {
      return { isSuspicious: false, sharedAccounts: [] }
    }

    const usersWithSameDevice = await this.em.find(
      User,
      { deviceId: user.deviceId, id: { $ne: userId } },
      { fields: ['id', 'name', 'deviceId'] },
    )

    const sharedAccounts: SuspiciousAccount[] = usersWithSameDevice.map(u => ({
      userId: u.id,
      name: u.name,
      sharedDeviceId: u.deviceId!,
    }))

    if (sharedAccounts.length > 0) {
      this.logger.warn(
        `User ${userId} shares deviceId ${user.deviceId} with ${sharedAccounts.length} other account(s)`,
      )
    }

    return {
      isSuspicious: sharedAccounts.length > 0,
      sharedAccounts,
    }
  }

  async reportSuspiciousReview(reviewId: string): Promise<{ flagged: boolean }> {
    const review = await this.em.findOne(Review, { id: reviewId })
    if (!review) {
      return { flagged: false }
    }

    // Flag review in admin content reports table
    await this.em.getConnection().execute(
      `INSERT INTO content_reports (id, entity_type, entity_id, reason, status, created_at)
       VALUES (gen_random_uuid(), 'REVIEW', ?, 'FRAUD_SUSPICION', 'PENDING', NOW())
       ON CONFLICT DO NOTHING`,
      [reviewId],
    )

    this.logger.warn(`Review ${reviewId} flagged for fraud suspicion`)

    return { flagged: true }
  }
}
