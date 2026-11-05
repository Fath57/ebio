import { Module } from '@nestjs/common'
import { BusinessCardsController } from './business-cards.controller'
import { BusinessCardsService } from './business-cards.service'

@Module({
  controllers: [BusinessCardsController],
  providers: [BusinessCardsService],
})
export class BusinessCardsModule {}
