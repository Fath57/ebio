import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { CertificationsController } from './certifications.controller'
import { CertificationsService } from './certifications.service'
import { PhotoStudioService } from './photo-studio.service'
import { ProductCopyService } from './product-copy.service'
import { ProductStudioController } from './product-studio.controller'
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
  imports: [SuppliersModule, MediaModule, NotificationsModule, AiModule],
  controllers: [ProductsController, CategoriesController, ProductUnitsController, CertificationsController, SupplierPromotionsController, AdminPromotionsController, RecommendationsController, ProductStudioController],
  providers: [ProductsService, CategoriesService, ProductUnitsService, CertificationsService, StockAlertService, PromotionsService, RecommendationsService, PhotoStudioService, ProductCopyService],
  exports: [ProductsService, CategoriesService, ProductUnitsService, CertificationsService, StockAlertService, PromotionsService],
})
export class ProductsModule {}
