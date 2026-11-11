import type { Response } from 'express'
import type { SalesStatementPeriod, SendSalesStatementInput } from './contracts/sales-statement.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Param, Post, Res, UseGuards } from '@nestjs/common'
import { CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { salesStatementPeriodSchema, sendSalesStatementSchema } from './contracts/sales-statement.contract'
import { sendStatementFile } from './sales-statements.controller'
import { SalesStatementsService } from './sales-statements.service'

/** Any shop's statement, from the back office. */
@Controller('admin/suppliers/:supplierId/sales-statement')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminSalesStatementsController {
  constructor(private readonly salesStatements: SalesStatementsService) {}

  @Post()
  @CanRead('Order')
  async download(
    @Param('supplierId') supplierId: string,
    @TypedBody(salesStatementPeriodSchema) body: SalesStatementPeriod,
    @Res() res: Response,
  ) {
    const supplier = await this.salesStatements.findSupplier(supplierId)
    sendStatementFile(res, await this.salesStatements.generate(supplier, body.from, body.to))
  }

  @Post('email')
  @CanRead('Order')
  async sendByEmail(
    @Param('supplierId') supplierId: string,
    @TypedBody(sendSalesStatementSchema) body: SendSalesStatementInput,
  ) {
    const supplier = await this.salesStatements.findSupplier(supplierId)
    const sentTo = await this.salesStatements.send(supplier, body.from, body.to, body.email)
    return { sentTo }
  }
}
