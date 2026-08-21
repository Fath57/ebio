import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { PromoCode } from './entities/promo-code.entity'
import { PromoRedemption } from './entities/promo-redemption.entity'
import { AdminPromoCodesController } from './promo-codes-admin.controller'
import { PromoCodesController, SupplierPromoCodesController } from './promo-codes.controller'
import { PromoCodesService } from './promo-codes.service'

@Module({
  imports: [
    MikroOrmModule.forFeature([PromoCode, PromoRedemption]),
    SuppliersModule,
  ],
  controllers: [PromoCodesController, SupplierPromoCodesController, AdminPromoCodesController],
  providers: [PromoCodesService],
  exports: [PromoCodesService],
})
export class PromoCodesModule {}
