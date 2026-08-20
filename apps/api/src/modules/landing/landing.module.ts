import { Module } from '@nestjs/common'
import { EmailModule } from '../email/email.module'
import { LandingController } from './landing.controller'
import { LandingService } from './landing.service'

@Module({
  imports: [EmailModule],
  controllers: [LandingController],
  providers: [LandingService],
  exports: [LandingService],
})
export class LandingModule {}
