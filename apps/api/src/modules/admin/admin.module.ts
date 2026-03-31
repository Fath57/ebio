import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { ContentReport } from './entities/content-report.entity'

@Module({
  imports: [
    MikroOrmModule.forFeature([ContentReport]),
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
