import type { Response } from 'express'
import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { SalesStatementPeriod, SendSalesStatementInput } from './contracts/sales-statement.contract'
import type { SalesStatementFile } from './sales-statements.service'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common'
import { CanRead } from '../../common/decorators/check-permissions.decorator'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { salesStatementPeriodSchema, sendSalesStatementSchema } from './contracts/sales-statement.contract'
import { SalesStatementsService } from './sales-statements.service'

export function sendStatementFile(res: Response, file: SalesStatementFile): void {
  res.setHeader('Content-Type', file.contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
  res.setHeader('Cache-Control', 'no-store')
  res.send(file.content)
}

/** The shop's own statement, from the supplier app. */
@Controller('suppliers/me/sales-statement')
@UseGuards(AuthGuard, ActiveSupplierGuard, RolesGuard, CaslGuard)
@Roles('SUPPLIER')
export class SupplierSalesStatementsController {
  constructor(private readonly salesStatements: SalesStatementsService) {}

  /** The phone cannot save a file the app downloads: it opens this link in its browser. */
  @Post('link')
  @CanRead('Supplier')
  async createLink(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(salesStatementPeriodSchema) body: SalesStatementPeriod,
  ) {
    const supplier = await this.salesStatements.findSupplierOfUser(session.user.id)
    return this.salesStatements.createLink(supplier, body.from, body.to)
  }

  @Post('email')
  @CanRead('Supplier')
  @UseGuards(RateLimitGuard)
  @RateLimit(10)
  async sendByEmail(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(sendSalesStatementSchema) body: SendSalesStatementInput,
  ) {
    const supplier = await this.salesStatements.findSupplierOfUser(session.user.id)
    const sentTo = await this.salesStatements.send(supplier, body.from, body.to, body.email)
    return { sentTo }
  }
}

/** Where the signed link lands: no session, the token is the authorization. */
@Controller('sales-statements')
export class SalesStatementDownloadController {
  constructor(private readonly salesStatements: SalesStatementsService) {}

  @Get('download')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(30)
  async download(@Query('token') token: string, @Res() res: Response) {
    const file = await this.salesStatements.generateFromToken(token ?? '')
    sendStatementFile(res, file)
  }
}
