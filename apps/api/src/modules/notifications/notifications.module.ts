import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { SmsModule } from '../../common/sms.module'
import { User } from '../auth/auth.entity'
import { DeviceToken } from './device-token.entity'
import { FcmService } from './fcm.service'
import { Notification } from './notification.entity'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'

@Module({
  imports: [MikroOrmModule.forFeature([Notification, DeviceToken, User]), SmsModule],
  controllers: [NotificationsController],
  providers: [FcmService, NotificationsService],
  // FcmService goes out too: the campaigns send their own pushes, in one
  // multicast rather than one notification row per person.
  exports: [NotificationsService, FcmService],
})
export class NotificationsModule {}
