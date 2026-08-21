import type { BetterAuthSession, LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { CreateSalesPoint, UpdateSalesPoint } from './contracts/sales-point.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { createSalesPointSchema, updateSalesPointSchema } from './contracts/sales-point.contract'
import { SalesPointsService } from './sales-points.service'
import { ValidationStatus } from './supplier.entity'
import { SuppliersService } from './suppliers.service'

@Controller()
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class SalesPointsController {
  constructor(
    private readonly salesPointsService: SalesPointsService,
    private readonly suppliersService: SuppliersService,
  ) {}

  /** Nest matches routes in declaration order: `me` must beat `:supplierId`. */
  @Get('suppliers/me/sales-points')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  async findMine(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const items = await this.salesPointsService.findMine(supplier.id)
    return { items, total: items.length }
  }

  /** The shop page of the app: active points of a visible shop. */
  @Get('suppliers/:supplierId/sales-points')
  @Public()
  async findBySupplier(
    @Session() session: BetterAuthSession,
    @Param('supplierId') supplierId: string,
  ) {
    const supplier = await this.suppliersService.findById(supplierId)
    // Same rule as the catalogue: a shop that is not validated shows nothing
    // to buyers, while its owner keeps seeing their own data.
    const isOwner = !!session?.user?.id && supplier.user?.id === session.user.id
    if (supplier.validationStatus !== ValidationStatus.VALIDATED && !isOwner) {
      return { items: [], total: 0 }
    }
    const items = await this.salesPointsService.findPublic(supplierId)
    return { items, total: items.length }
  }

  @Post('suppliers/me/sales-points')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Supplier')
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createSalesPointSchema) body: CreateSalesPoint,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.salesPointsService.create(supplier.id, body)
  }

  @Patch('suppliers/me/sales-points/:id')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Supplier')
  async update(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
    @TypedBody(updateSalesPointSchema) body: UpdateSalesPoint,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.salesPointsService.update(supplier.id, id, body)
  }

  @Delete('suppliers/me/sales-points/:id')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Supplier')
  async remove(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    await this.salesPointsService.remove(supplier.id, id)
    return { success: true }
  }
}
