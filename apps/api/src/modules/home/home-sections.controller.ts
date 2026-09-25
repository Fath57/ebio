import type { HomeSectionInput, HomeSectionOrderInput } from './contracts/home-section.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { homeSectionInputSchema, homeSectionOrderSchema } from './contracts/home-section.contract'
import { HomeSectionsService } from './home-sections.service'

/**
 * The home screen, as the app receives it.
 *
 * Open without authentication: the home page is looked at before signing in,
 * and a position is enough to compose it.
 */
@Controller('home')
export class HomeController {
  constructor(private readonly sections: HomeSectionsService) {}

  @Get('sections')
  async list(
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
  ) {
    return {
      sections: await this.sections.listForBuyer({
        latitude: latitude === undefined ? undefined : Number(latitude),
        longitude: longitude === undefined ? undefined : Number(longitude),
      }),
    }
  }
}

/**
 * The sections as the back-office sees them, switched-off ones included.
 */
@Controller('admin/home-sections')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminHomeSectionsController {
  constructor(private readonly sections: HomeSectionsService) {}

  @CanRead('Settings')
  @Get()
  async list() {
    return { sections: await this.sections.listAll() }
  }

  @CanManage('Settings')
  @Post()
  async create(@TypedBody(homeSectionInputSchema) body: HomeSectionInput) {
    return this.sections.create(body)
  }

  @CanManage('Settings')
  @Put('order')
  async reorder(@TypedBody(homeSectionOrderSchema) body: HomeSectionOrderInput) {
    return { sections: await this.sections.reorder(body.ids) }
  }

  @CanManage('Settings')
  @Put(':id')
  async update(
    @Param('id') id: string,
    @TypedBody(homeSectionInputSchema) body: HomeSectionInput,
  ) {
    return this.sections.update(id, body)
  }

  @CanManage('Settings')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.sections.remove(id)
    return { removed: true }
  }
}
