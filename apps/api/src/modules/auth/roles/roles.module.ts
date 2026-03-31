import { Global, Module } from '@nestjs/common'
import { CaslAbilityFactory } from '../casl/casl-ability.factory'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

@Global()
@Module({
  controllers: [RolesController],
  providers: [RolesService, CaslAbilityFactory],
  exports: [RolesService, CaslAbilityFactory],
})
export class RolesModule {}
