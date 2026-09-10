import { Module } from '@nestjs/common'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { ProductUnitsController } from './product-units.controller'
import { ProductUnitsService } from './product-units.service'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { AdminPromotionsController, SupplierPromotionsController } from './promotions.controller'
import { PromotionsService } from './promotions.service'
import { RecommendationsController } from './recommendations.controller'
import { RecommendationsService } from './recommendations.service'
import { StockAlertService } from './stock-alert.service'

@Module({
  imports: [SuppliersModule, MediaModule, NotificationsModule],
  controllers: [ProductsController, CategoriesController, ProductUnitsController, SupplierPromotionsController, AdminPromotionsController, RecommendationsController],
  providers: [ProductsService, CategoriesService, ProductUnitsService, StockAlertService, PromotionsService, RecommendationsService],
  exports: [ProductsService, CategoriesService, ProductUnitsService, StockAlertService, PromotionsService],
})
export class ProductsModule {}
