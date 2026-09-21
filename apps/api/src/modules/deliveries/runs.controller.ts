import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CanRead, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { DeliveriesMapper } from './deliveries.mapper'
import { DeliveriesService } from './deliveries.service'

/**
 * La tournée côté livreur : une proposition, une décision.
 *
 * Elle ne s'accepte pas par morceaux (FR-015). Les livraisons qu'elle contient
 * gardent leurs propres endpoints pour la collecte et la remise — le statut
 * reste par commande, c'est ce qui laisse l'app fournisseur intacte.
 */
@Controller('runs')
@UseGuards(AuthGuard)
export class RunsController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('offers')
  @UseGuards(CaslGuard)
  @CanRead('Delivery')
  async offers(@Session() session: LoggedInBetterAuthSession) {
    const rows = await this.deliveriesService.getRunOffers(session.user.id)
    return rows.map(DeliveriesMapper.toRunOffer)
  }

  @Post(':id/accept')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async accept(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    const run = await this.deliveriesService.acceptRun(id, session.user.id)
    return { runId: run.id, pickupOrder: run.pickupOrder, shopCount: run.shopCount }
  }

  /** Offre ciblée refusée : le suivant du classement est sollicité aussitôt. */
  @Post(':id/decline')
  @UseGuards(CaslGuard)
  @CanUpdate('Delivery')
  async decline(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id') id: string,
  ) {
    await this.deliveriesService.declineRun(id, session.user.id)
    return { declined: true }
  }
}
