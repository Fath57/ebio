import { Global, Module } from '@nestjs/common'
import { EmailModule } from '../../email/email.module'
import { CaslAbilityFactory } from '../casl/casl-ability.factory'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'
import { StaffController } from './staff.controller'
import { StaffService } from './staff.service'

@Global()
@Module({
  imports: [EmailModule],
  controllers: [RolesController, StaffController],
  providers: [RolesService, StaffService, CaslAbilityFactory],
  exports: [RolesService, CaslAbilityFactory],
})
export class RolesModule {}
