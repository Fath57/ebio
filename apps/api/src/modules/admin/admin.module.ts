import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { EmailModule } from '../email/email.module'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { OrdersModule } from '../orders/orders.module'
import { PaymentsModule } from '../payments/payments.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { ContentReport } from './entities/content-report.entity'

@Module({
  imports: [
    MikroOrmModule.forFeature([ContentReport]),
    EmailModule,
    MediaModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    PlatformSettingsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
