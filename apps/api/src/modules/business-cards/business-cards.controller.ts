import type { Response } from 'express'
import type { GenerateBusinessCardsInput } from './business-card.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Post, Res, UseGuards } from '@nestjs/common'
import { CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { generateBusinessCardsSchema } from './business-card.contract'
import { BusinessCardsService } from './business-cards.service'

@Controller('admin/business-cards')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class BusinessCardsController {
  constructor(private readonly businessCards: BusinessCardsService) {}

  /** Printable sheets for the chosen shops. Everything on a card is already public. */
  @Post()
  @CanRead('Supplier')
  async generate(
    @TypedBody(generateBusinessCardsSchema) body: GenerateBusinessCardsInput,
    @Res() res: Response,
  ) {
    const pdf = await this.businessCards.generate(body)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="cartes-de-visite-ebio.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.send(pdf)
  }
}
