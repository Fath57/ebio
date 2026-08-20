import type { Request } from 'express'
import type { ContactMessage, CreateLandingFaq, UpdateLandingFaq } from './contracts/landing.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import { CanCreate, CanDelete, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import {
  contactMessageSchema,
  createLandingFaqSchema,
  LANDING_SECTION_SCHEMAS,
  landingSectionKeySchema,
  updateLandingFaqSchema,
} from './contracts/landing.contract'
import { LandingService } from './landing.service'

/**
 * Roles are declared per method, not on the class: `RolesGuard` ignores the
 * `@Public` flag, so a class-level guard would lock the public route.
 */
@Controller('landing')
@UseGuards(AuthGuard)
export class LandingController {
  constructor(private readonly landingService: LandingService) {}

  /** Everything the landing site renders, in one call. */
  @Get('content')
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  async getContent() {
    return this.landingService.getPublicContent()
  }

  /** The contact form of the landing: forwarded to the configured inboxes. */
  @Post('contact')
  @Public()
  async sendContactMessage(
    @TypedBody(contactMessageSchema) body: ContactMessage,
    @Req() request: Request,
  ) {
    // Behind the proxy the client address travels in x-forwarded-for; locally
    // request.ip does the job. The rate limiter needs a stable key, not truth.
    const forwarded = request.headers['x-forwarded-for']
    const senderKey = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim()
      || request.ip
      || 'unknown'
    await this.landingService.sendContactMessage(body, senderKey)
    return { success: true }
  }

  /** Every section, contact recipients included. Backoffice only. */
  @Get('content/admin')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  async getAdminContent() {
    return this.landingService.getAdminContent()
  }

  /**
   * The body is validated by the schema matching the section key: `@TypedBody`
   * cannot express a per-parameter schema, so the lookup happens here.
   */
  @Put('content/:key')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('LandingContent')
  async updateSection(
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    const parsedKey = landingSectionKeySchema.safeParse(key)
    if (!parsedKey.success) {
      throw new BadRequestException(`Section inconnue : ${key}`)
    }
    const parsedBody = LANDING_SECTION_SCHEMAS[parsedKey.data].safeParse(body)
    if (!parsedBody.success) {
      throw new BadRequestException(parsedBody.error.issues[0]?.message ?? 'Contenu invalide')
    }
    await this.landingService.updateSection(parsedKey.data, parsedBody.data)
    return { success: true }
  }

  @Get('faqs')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  async findAllFaqs() {
    return this.landingService.findAllFaqs()
  }

  @Post('faqs')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanCreate('LandingContent')
  async createFaq(@TypedBody(createLandingFaqSchema) body: CreateLandingFaq) {
    return this.landingService.createFaq(body)
  }

  @Patch('faqs/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('LandingContent')
  async updateFaq(
    @Param('id') id: string,
    @TypedBody(updateLandingFaqSchema) body: UpdateLandingFaq,
  ) {
    return this.landingService.updateFaq(id, body)
  }

  @Delete('faqs/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @UseGuards(RolesGuard, CaslGuard)
  @CanDelete('LandingContent')
  async removeFaq(@Param('id') id: string) {
    await this.landingService.removeFaq(id)
    return { success: true }
  }
}
