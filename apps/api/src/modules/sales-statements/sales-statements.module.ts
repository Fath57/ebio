import { Module } from '@nestjs/common'
import { EmailModule } from '../email/email.module'
import { AdminSalesStatementsController } from './admin-sales-statements.controller'
import { SalesStatementDownloadController, SupplierSalesStatementsController } from './sales-statements.controller'
import { SalesStatementsService } from './sales-statements.service'

@Module({
  imports: [EmailModule],
  controllers: [SupplierSalesStatementsController, SalesStatementDownloadController, AdminSalesStatementsController],
  providers: [SalesStatementsService],
})
export class SalesStatementsModule {}
