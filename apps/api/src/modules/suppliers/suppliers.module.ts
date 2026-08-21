import { Module } from '@nestjs/common'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { UsersModule } from '../users/users.module'
import { SalesPointsController } from './sales-points.controller'
import { SalesPointsService } from './sales-points.service'
import { SuppliersController } from './suppliers.controller'
import { SuppliersService } from './suppliers.service'

@Module({
  imports: [UsersModule, MediaModule, NotificationsModule],
  controllers: [SuppliersController, SalesPointsController],
  providers: [SuppliersService, SalesPointsService],
  exports: [SuppliersService, SalesPointsService],
})
export class SuppliersModule {}
