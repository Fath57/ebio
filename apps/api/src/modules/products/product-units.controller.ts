import type { CreateProductUnit, UpdateProductUnit } from './contracts/product-unit.contract'
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
import { CanCreate, CanDelete, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { createProductUnitSchema, updateProductUnitSchema } from './contracts/product-unit.contract'
import { ProductUnitsService } from './product-units.service'

/**
 * Roles are declared per method, not on the class: `RolesGuard` ignores the
 * `@Public` flag, so a class-level guard would lock the public route.
 */
@Controller('product-units')
@UseGuards(AuthGuard)
export class ProductUnitsController {
  constructor(private readonly productUnitsService: ProductUnitsService) {}

  /** What the product forms and the catalogue read. Active units only. */
  @Get('active')
  @Public()
  async findActive() {
    return this.productUnitsService.findAll(true)
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  async findAll() {
    return this.productUnitsService.findAll(false)
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  async findById(@Param('id') id: string) {
    return this.productUnitsService.findById(id)
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanCreate('ProductUnit')
  async create(@TypedBody(createProductUnitSchema) body: CreateProductUnit) {
    return this.productUnitsService.create(body)
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('ProductUnit')
  async update(
    @Param('id') id: string,
    @TypedBody(updateProductUnitSchema) body: UpdateProductUnit,
  ) {
    return this.productUnitsService.update(id, body)
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanDelete('ProductUnit')
  async remove(@Param('id') id: string) {
    await this.productUnitsService.remove(id)
    return { success: true }
  }
}
