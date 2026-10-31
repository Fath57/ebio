import type { CreateCertification, UpdateCertification } from './contracts/certification.contract'
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
import { CertificationsService } from './certifications.service'
import { createCertificationSchema, updateCertificationSchema } from './contracts/certification.contract'

/**
 * Roles are declared per method, not on the class: `RolesGuard` ignores the
 * `@Public` flag, so a class-level guard would lock the public route.
 */
@Controller('certifications')
@UseGuards(AuthGuard)
export class CertificationsController {
  constructor(private readonly certificationsService: CertificationsService) {}

  /** What the product forms, the apps and the catalogue read. Active labels only. */
  @Get('active')
  @Public()
  async findActive() {
    return this.certificationsService.findAll(true)
  }

  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  async findAll() {
    return this.certificationsService.findAll(false)
  }

  @Get(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  async findById(@Param('id') id: string) {
    return this.certificationsService.findById(id)
  }

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanCreate('Certification')
  async create(@TypedBody(createCertificationSchema) body: CreateCertification) {
    return this.certificationsService.create(body)
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Certification')
  async update(
    @Param('id') id: string,
    @TypedBody(updateCertificationSchema) body: UpdateCertification,
  ) {
    return this.certificationsService.update(id, body)
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanDelete('Certification')
  async remove(@Param('id') id: string) {
    await this.certificationsService.remove(id)
    return { success: true }
  }
}
