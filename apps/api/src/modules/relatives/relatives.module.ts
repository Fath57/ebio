import { Module } from '@nestjs/common'
import { RelativesController } from './relatives.controller'
import { RelativesService } from './relatives.service'

/** The payer's address book of relatives (009). */
@Module({
  controllers: [RelativesController],
  providers: [RelativesService],
  exports: [RelativesService],
})
export class RelativesModule {}
