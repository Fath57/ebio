import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { CanRead, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import {
  deliveryZoneSchema,
  openingHoursSchema,
  registerSupplierSchema,
  updateSupplierSchema,
} from './contracts/supplier.contract'
import { SupplierMapper } from './suppliers.mapper'
import { SuppliersService } from './suppliers.service'

@Controller('suppliers')
@UseGuards(AuthGuard, ActiveSupplierGuard)
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
  ) {}

  @Post('register')
  async register(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(registerSupplierSchema) body: z.infer<typeof registerSupplierSchema>,
  ) {
    const supplier = await this.suppliersService.register(session.user.id, body)
    const coordinates = await this.suppliersService.findCoordinates(supplier.id)
    return SupplierMapper.toResponse(supplier, coordinates)
  }

  @Get('nearby')
  @Public()
  async findNearby(
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('radius') radiusParam?: string,
  ) {
    const lat = latitude ? Number(latitude) : undefined
    const lng = longitude ? Number(longitude) : undefined
    const radiusKm = radiusParam ? Number(radiusParam) : undefined

    return this.suppliersService.findNearby(lat, lng, radiusKm)
  }

  @Get(':id')
  @Public()
  async findById(@Param('id') id: string) {
    const supplier = await this.suppliersService.findById(id)
    const coordinates = await this.suppliersService.findCoordinates(supplier.id)
    return SupplierMapper.toResponse(supplier, coordinates)
  }

  @Put('me')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Supplier')
  async updateMe(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(updateSupplierSchema) body: z.infer<typeof updateSupplierSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const updated = await this.suppliersService.update(supplier.id, body)
    const coordinates = await this.suppliersService.findCoordinates(updated.id)
    return SupplierMapper.toResponse(updated, coordinates)
  }

  @Get('me/status')
  async getMyStatus(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliersService.findByUserId(session.user.id).catch(() => null)
    if (!supplier) {
      return { isSupplier: false, validationStatus: null }
    }
    return {
      isSupplier: true,
      supplierId: supplier.id,
      validationStatus: supplier.validationStatus,
      shopName: supplier.shopName,
    }
  }

  @Get('me/dashboard')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanRead('Supplier')
  async getDashboard(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.suppliersService.getDashboard(supplier.id)
  }

  @Post('me/delivery-zones')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Supplier')
  async createDeliveryZone(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(deliveryZoneSchema) body: z.infer<typeof deliveryZoneSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.suppliersService.createDeliveryZone(supplier.id, body)
  }

  @Delete('me/delivery-zones/:zoneId')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Supplier')
  async deleteDeliveryZone(
    @Session() session: LoggedInBetterAuthSession,
    @Param('zoneId') zoneId: string,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    await this.suppliersService.deleteDeliveryZone(supplier.id, zoneId)
    return { deleted: true }
  }

  @Get('me/settings')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanRead('Supplier')
  async getSettings(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.suppliersService.getSettings(supplier.id)
  }

  @Patch('me/settings/opening-hours')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Supplier')
  async updateOpeningHours(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(z.object({ openingHours: openingHoursSchema }).meta({ title: 'UpdateOpeningHours' })) body: { openingHours: Record<string, unknown> },
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.suppliersService.updateOpeningHours(supplier.id, body.openingHours)
  }

  @Patch('me/settings/mode')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Supplier')
  async updateMode(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(z.object({ mode: z.enum(['CONTACT', 'ORDER']) }).meta({ title: 'UpdateMode' })) body: { mode: 'CONTACT' | 'ORDER' },
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.suppliersService.updateMode(supplier.id, body.mode)
  }

  @Get('me/analytics')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanRead('Supplier')
  async getAnalytics(
    @Session() session: LoggedInBetterAuthSession,
    @Query('period') period: string = 'month',
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.suppliersService.getAnalytics(supplier.id, period)
  }

  @Get('me/analytics/top-products')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanRead('Supplier')
  async getTopProducts(
    @Session() session: LoggedInBetterAuthSession,
    @Query('period') period: string = 'month',
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.suppliersService.getTopProducts(supplier.id, period)
  }

  @Get('me/analytics/ratings')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanRead('Supplier')
  async getRatingsOverview(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.suppliersService.getRatingsOverview(supplier.id)
  }
}
