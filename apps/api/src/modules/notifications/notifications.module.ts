import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { DeviceToken } from './device-token.entity'
import { FcmService } from './fcm.service'
import { Notification } from './notification.entity'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

@Module({
  imports: [MikroOrmModule.forFeature([Notification, DeviceToken, User])],
  controllers: [NotificationsController],
  providers: [FcmService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
