import { Module } from '@nestjs/common'
import { RolesModule } from '../auth/roles/roles.module'
import { EmailModule } from '../email/email.module'
import { StaffInboxController } from './staff-inbox.controller'
import { StaffInboxService } from './staff-inbox.service'

@Module({
  imports: [RolesModule, EmailModule],
  controllers: [StaffInboxController],
  providers: [StaffInboxService],
  exports: [StaffInboxService],
})
export class StaffInboxModule {}
