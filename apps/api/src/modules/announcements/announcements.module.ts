import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { WalletModule } from '../wallet/wallet.module'
import { AnnouncementRequest } from './announcement-request.entity'
import { AnnouncementView } from './announcement-view.entity'
import { Announcement } from './announcement.entity'
import {
  AdminAnnouncementsController,
  AnnouncementsController,
  SupplierAnnouncementRequestsController,
} from './announcements.controller'
import { AnnouncementsService } from './announcements.service'

/**
 * The announcements shown when the app opens.
 *
 * Same money circuit as the banners — the shop's wallet is debited when the
 * request is filed, a rejection refunds it — so that each explains the other.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([Announcement, AnnouncementRequest, AnnouncementView]),
    PlatformSettingsModule,
    SuppliersModule,
    WalletModule,
  ],
  controllers: [AnnouncementsController, SupplierAnnouncementRequestsController, AdminAnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
