import type { CreateBanner, UpdateBanner } from './contracts/banner.contract'
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
import { BannersService } from './banners.service'
import { createBannerSchema, updateBannerSchema } from './contracts/banner.contract'

/**
 * Les rôles sont posés par méthode et non sur la classe : `RolesGuard` ignore
 * le drapeau `@Public`, une garde de classe rendrait donc la route publique
 * inaccessible.
 */
@Controller('banners')
@UseGuards(AuthGuard)
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  /** Lecture publique : c'est ce que consomme l'accueil mobile. */
  @Get('active')
  @Public()
  async findActive() {
    return this.bannersService.findActive()
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  async findAll() {
    return this.bannersService.findAll()
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  async findById(@Param('id') id: string) {
    return this.bannersService.findById(id)
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanCreate('Banner')
  async create(@TypedBody(createBannerSchema) body: CreateBanner) {
    return this.bannersService.create(body)
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Banner')
  async update(
    @Param('id') id: string,
    @TypedBody(updateBannerSchema) body: UpdateBanner,
  ) {
    return this.bannersService.update(id, body)
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanDelete('Banner')
  async remove(@Param('id') id: string) {
    await this.bannersService.remove(id)
    return { success: true }
  }
}
