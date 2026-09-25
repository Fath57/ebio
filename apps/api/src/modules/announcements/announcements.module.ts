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
 * Les annonces affichées à l'ouverture de l'application.
 *
 * Même circuit d'argent que les bannières — le portefeuille de la boutique est
 * débité au dépôt, un refus rembourse — pour que les deux se comprennent l'un
 * par l'autre.
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
