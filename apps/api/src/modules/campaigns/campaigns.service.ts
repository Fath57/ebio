import type { CampaignInput } from './contracts/campaign.contract'
import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { User } from '../auth/auth.entity'
import { FcmService } from '../notifications/fcm.service'
import { Campaign, CampaignSegment, CampaignStatus } from './entities/campaign.entity'

/**
 * How each segment is found, in SQL.
 *
 * Every one starts from a device token: someone without one cannot be
 * notified, and counting them would promise a reach that does not exist.
 * `$1` is the app.
 */
const SEGMENTS: Record<CampaignSegment, string> = {
  [CampaignSegment.ALL]: '',
  [CampaignSegment.ACTIVE]: `
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.buyer_id = d."userId" AND o."createdAt" >= NOW() - INTERVAL '30 days'
    )`,
  [CampaignSegment.NEVER_ORDERED]: `
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.buyer_id = d."userId")`,
  [CampaignSegment.LAPSED]: `
    AND EXISTS (SELECT 1 FROM orders o WHERE o.buyer_id = d."userId")
    AND NOT EXISTS (
      SELECT 1 FROM orders o
      WHERE o.buyer_id = d."userId" AND o."createdAt" >= NOW() - INTERVAL '60 days'
    )`,
  [CampaignSegment.WITH_CART]: `
    AND EXISTS (
      SELECT 1 FROM carts c
      JOIN cart_items ci ON ci.cart_id = c.id
      WHERE c.user_id = d."userId"
    )`,
}

/** Sent in slices: one failure should not take the rest with it. */
const BATCH_SIZE = 200

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly fcm: FcmService,
  ) {}

  /**
   * How many phones a segment reaches, before anything is sent.
   *
   * Shown while the campaign is being written: "everyone" means something
   * different on a Tuesday than it did last month, and a number that appears
   * after the fact is a number nobody could have acted on.
   */
  async countFor(app: string, segment: CampaignSegment): Promise<number> {
    const rows = await this.em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(DISTINCT d."userId")::text AS count
       FROM device_tokens d
       JOIN users u ON u.id = d."userId"
       WHERE d.app = ?
         AND u.status = 'ACTIVE'
         ${SEGMENTS[segment]}`,
      [app],
    )
    return Number(rows[0]?.count ?? 0)
  }

  async list(): Promise<Campaign[]> {
    return this.em.find(Campaign, {}, { orderBy: { createdAt: 'DESC' }, limit: 100 })
  }

  async create(input: CampaignInput, authorId: string): Promise<Campaign> {
    const fork = this.em.fork()
    const campaign = fork.create(Campaign, {
      title: input.title,
      body: input.body,
      imageUrl: input.imageUrl ?? undefined,
      app: input.app,
      segment: input.segment as CampaignSegment,
      targetType: input.targetType,
      targetId: input.targetId ?? undefined,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      status: input.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      createdBy: fork.getReference(User, authorId),
    })
    await fork.flush()
    return campaign
  }

  async cancel(id: string): Promise<Campaign> {
    const fork = this.em.fork()
    const campaign = await fork.findOne(Campaign, { id })
    if (!campaign) {
      throw new NotFoundException('Campagne introuvable')
    }
    if (campaign.status === CampaignStatus.SENT || campaign.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Une campagne déjà partie ne s\'annule pas')
    }
    campaign.status = CampaignStatus.CANCELLED
    await fork.flush()
    return campaign
  }

  /** One message to one person, to see it on a real phone first. */
  async sendTest(id: string, userId: string): Promise<{ sent: number }> {
    const campaign = await this.em.findOne(Campaign, { id })
    if (!campaign) {
      throw new NotFoundException('Campagne introuvable')
    }
    const tokens = await this.tokensFor(campaign.app, [userId])
    const sent = await this.push(campaign, tokens)
    return { sent }
  }

  /**
   * Sends it, now.
   *
   * The status moves before the first push: a second click while the first is
   * still running would otherwise send everything twice, and there is no way
   * to take a notification back.
   */
  async send(id: string): Promise<Campaign> {
    const fork = this.em.fork()
    const campaign = await fork.findOne(Campaign, { id })
    if (!campaign) {
      throw new NotFoundException('Campagne introuvable')
    }
    if (campaign.status === CampaignStatus.SENT || campaign.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Cette campagne est déjà partie')
    }

    campaign.status = CampaignStatus.SENDING
    await fork.flush()

    const recipients = await this.recipientsFor(campaign.app, campaign.segment)
    let sent = 0
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const slice = recipients.slice(i, i + BATCH_SIZE)
      const tokens = await this.tokensFor(campaign.app, slice)
      sent += await this.push(campaign, tokens)
    }

    campaign.recipients = recipients.length
    campaign.sent = sent
    campaign.failed = Math.max(0, recipients.length - sent)
    campaign.status = CampaignStatus.SENT
    campaign.sentAt = new Date()
    await fork.flush()

    this.logger.log(`Campagne « ${campaign.title} » : ${sent}/${recipients.length} envoyée(s)`)
    return campaign
  }

  /**
   * Picks up what is due.
   *
   * Every five minutes: a campaign set for 9:00 going out at 9:03 bothers
   * nobody, and looking every minute would cost a query a minute for nothing.
   */
  @Cron('0 */5 * * * *')
  // Outside a request the global EntityManager is refused; the decorator opens
  // the context, as for the review invitations.
  @EnsureRequestContext()
  async sendDueCampaigns(): Promise<void> {
    const due = await this.em.find(Campaign, {
      status: CampaignStatus.SCHEDULED,
      scheduledAt: { $lte: new Date() },
    }, { limit: 10 })

    for (const campaign of due) {
      try {
        await this.send(campaign.id)
      }
      catch (error) {
        this.logger.error(`Campagne « ${campaign.title} » non partie — ${error}`)
      }
    }
  }

  private async recipientsFor(app: string, segment: CampaignSegment): Promise<string[]> {
    const rows = await this.em.getConnection().execute<Array<{ userId: string }>>(
      `SELECT DISTINCT d."userId"
       FROM device_tokens d
       JOIN users u ON u.id = d."userId"
       WHERE d.app = ?
         AND u.status = 'ACTIVE'
         ${SEGMENTS[segment]}`,
      [app],
    )
    return rows.map(row => row.userId)
  }

  private async tokensFor(app: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) {
      return []
    }
    const rows = await this.em.getConnection().execute<Array<{ token: string }>>(
      `SELECT d.token FROM device_tokens d
       WHERE d.app = ? AND d."userId" IN (${userIds.map(() => '?').join(', ')})`,
      [app, ...userIds],
    )
    return rows.map(row => row.token)
  }

  private async push(campaign: Campaign, tokens: string[]): Promise<number> {
    const { success } = await this.fcm.sendToDevices(
      tokens,
      campaign.title,
      campaign.body,
      {
        type: 'PROMOTIONAL',
        campaignId: campaign.id,
        targetType: campaign.targetType,
        ...(campaign.targetId ? { targetId: campaign.targetId } : {}),
      },
      {
        imageUrl: campaign.imageUrl,
        // A campaign replaces its own pending message rather than stacking in
        // the tray — nobody wants the same offer three times.
        collapseKey: `campaign-${campaign.id}`,
      },
    )
    return success
  }
}
