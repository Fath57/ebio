import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { EmailModule } from '../email/email.module'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { OrdersModule } from '../orders/orders.module'
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
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
