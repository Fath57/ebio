import { Module } from '@nestjs/common'
import { MediaModule } from '../media/media.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { SuppliersModule } from '../suppliers/suppliers.module'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { StockAlertService } from './stock-alert.service'

@Module({
  imports: [SuppliersModule, MediaModule, NotificationsModule],
  controllers: [ProductsController, CategoriesController],
  providers: [ProductsService, CategoriesService, StockAlertService],
  exports: [ProductsService, CategoriesService, StockAlertService],
})
export class ProductsModule {}
