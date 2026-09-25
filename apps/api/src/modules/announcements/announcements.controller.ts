import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type {
  AnnouncementIntervalInput,
  AnnouncementRequestInput,
  ApproveAnnouncementInput,
  PlatformAnnouncementInput,
  RejectAnnouncementInput,
} from './contracts/announcement.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { SuppliersService } from '../suppliers/suppliers.service'
import { AnnouncementRequestStatus } from './announcement-request.entity'
import { AnnouncementsService } from './announcements.service'
import {
  announcementIntervalSchema,
  announcementRequestSchema,
  approveAnnouncementSchema,
  platformAnnouncementSchema,
  rejectAnnouncementSchema,
} from './contracts/announcement.contract'

/** What the buyer sees on opening the app. */
@Controller('announcements')
@UseGuards(AuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  /**
   * The announcement of the moment, or nothing.
   *
   * Returning `null` rather than an empty array: the app has a decision to
   * make — open a modal or not — not a list to walk.
   */
  @Get('current')
  async current(@Session() session: LoggedInBetterAuthSession) {
    const announcement = await this.announcements.currentFor(session.user.id)
    if (!announcement) {
      return { announcement: null }
    }
    return {
      announcement: {
        id: announcement.id,
        title: announcement.title ?? null,
        subtitle: announcement.subtitle ?? null,
        imageUrl: announcement.imageUrl ?? null,
        targetType: announcement.targetType,
        targetId: announcement.targetId ?? null,
        shopName: announcement.supplier?.shopName ?? null,
      },
    }
  }

  @Post(':id/seen')
  async seen(@Session() session: LoggedInBetterAuthSession, @Param('id') id: string) {
    await this.announcements.markSeen(session.user.id, id)
    return { seen: true }
  }
}

/** What a shop requests, and pays for. */
@Controller('suppliers/me/announcement-requests')
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class SupplierAnnouncementRequestsController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly suppliers: SuppliersService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** The posted prices, so the shop can pick a duration. */
  @Get('offers')
  async offers() {
    return this.settings.getAnnouncementOffers()
  }

  @Get()
  async list(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    return { requests: await this.announcements.listRequestsForSupplier(supplier.id) }
  }

  @Post()
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(announcementRequestSchema) body: AnnouncementRequestInput,
  ) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    return this.announcements.requestForSupplier(supplier.id, body)
  }

  @Post(':id/cancel')
  async cancel(@Session() session: LoggedInBetterAuthSession, @Param('id') id: string) {
    const supplier = await this.suppliers.findByUserId(session.user.id)
    return this.announcements.cancelRequest(supplier.id, id)
  }
}

@Controller('admin/announcements')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminAnnouncementsController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  @CanRead('Settings')
  @Get('requests')
  async listRequests(@Query('status') status?: string) {
    return {
      requests: await this.announcements.listRequests(
        status === undefined ? undefined : (status as AnnouncementRequestStatus),
      ),
    }
  }

  @CanManage('Settings')
  @Post('requests/:id/approve')
  async approve(
    @Param('id') id: string,
    @TypedBody(approveAnnouncementSchema) body: ApproveAnnouncementInput,
  ) {
    return this.announcements.approveRequest(id, body)
  }

  @CanManage('Settings')
  @Post('requests/:id/reject')
  async reject(
    @Param('id') id: string,
    @TypedBody(rejectAnnouncementSchema) body: RejectAnnouncementInput,
  ) {
    return this.announcements.rejectRequest(id, body.reason)
  }

  @CanRead('Settings')
  @Get()
  async list() {
    return { announcements: await this.announcements.listAnnouncements() }
  }

  @CanManage('Settings')
  @Post()
  async create(@TypedBody(platformAnnouncementSchema) body: PlatformAnnouncementInput) {
    return this.announcements.createPlatformAnnouncement(body)
  }

  @CanManage('Settings')
  @Put(':id/active')
  async setActive(@Param('id') id: string, @Body('active') active: boolean) {
    return this.announcements.setActive(id, active === true)
  }

  @CanRead('Settings')
  @Get('settings/interval')
  async getInterval() {
    return { intervalleHeures: await this.settings.getAnnouncementIntervalHours() }
  }

  @CanManage('Settings')
  @Put('settings/interval')
  async setInterval(@TypedBody(announcementIntervalSchema) body: AnnouncementIntervalInput) {
    await this.settings.setAnnouncementIntervalHours(body.intervalleHeures)
    return { intervalleHeures: await this.settings.getAnnouncementIntervalHours() }
  }
}
