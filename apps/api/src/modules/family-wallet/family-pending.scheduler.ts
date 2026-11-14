import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { SingleInstance } from '../db/cron-lock'
import { FamilyMemberStatus, FamilyWalletMember } from './entities/family-wallet-member.entity'
import { FamilyWalletStatus } from './entities/family-wallet.entity'
import { FamilyNotifierService } from './family-notifier.service'

const DAY_MS = 24 * 60 * 60 * 1000

/** How long a relative may stay pending before the payer is reminded (FR-030). */
export const PENDING_REMINDER_DAYS = 30

/**
 * Once a day: the members still pending 30 days after being added are
 * pointed out to their payer, who may resend the invitation or remove them.
 * Once per member, `pending_reminded_at` is set before the next run.
 */
@Injectable()
export class FamilyPendingScheduler {
  private readonly logger = new Logger(FamilyPendingScheduler.name)

  constructor(
    private readonly em: EntityManager,
    private readonly notifier: FamilyNotifierService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  @SingleInstance()
  @EnsureRequestContext()
  async remindPendingMembers(): Promise<void> {
    const reminded = await this.remind(new Date())
    if (reminded > 0) {
      this.logger.log(`${reminded} rappel(s) de membres en attente envoyé(s)`)
    }
  }

  /** The job itself, with its clock passed in; returns how many payers were reminded. */
  async remind(now: Date): Promise<number> {
    const due = await this.em.find(FamilyWalletMember, {
      status: FamilyMemberStatus.PENDING,
      pendingRemindedAt: null,
      createdAt: { $lte: new Date(now.getTime() - PENDING_REMINDER_DAYS * DAY_MS) },
      familyWallet: { status: { $ne: FamilyWalletStatus.CLOSED } },
    }, { limit: 500 })

    for (const member of due) {
      // Marked first: a failed push is not worth a second reminder.
      member.pendingRemindedAt = now
      await this.em.flush()
      await this.notifier.onMemberStillPending(member.id)
    }
    return due.length
  }
}
