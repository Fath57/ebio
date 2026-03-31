import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanCreate, CanRead, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { SuppliersService } from '../suppliers/suppliers.service'
import {
  createSubscriptionSchema,
  upgradeSubscriptionSchema,
} from './contracts/subscription.contract'
import { SubscriptionsService } from './subscriptions.service'

@Controller('subscriptions')
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly suppliersService: SuppliersService,
  ) {}

  @Public()
  @Get('plans')
  async getPlans() {
    return this.subscriptionsService.getPlans()
  }

  @Post()
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanCreate('Subscription')
  async subscribe(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(createSubscriptionSchema) body: z.infer<typeof createSubscriptionSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.subscriptionsService.subscribe(supplier.id, body)
  }

  @Get('me')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanRead('Subscription')
  async getCurrentSubscription(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    return this.subscriptionsService.getCurrentSubscription(supplier.id)
  }

  @Patch('me/cancel')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Subscription')
  async cancelSubscription(@Session() session: LoggedInBetterAuthSession) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const subscription = await this.subscriptionsService.getCurrentSubscription(supplier.id)
    if (!subscription) {
      return { message: 'Aucun abonnement actif' }
    }
    return this.subscriptionsService.cancelSubscription(subscription.id)
  }

  @Post('me/upgrade')
  @Roles('SUPPLIER')
  @UseGuards(RolesGuard, CaslGuard)
  @CanUpdate('Subscription')
  async upgradeSubscription(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(upgradeSubscriptionSchema) body: z.infer<typeof upgradeSubscriptionSchema>,
  ) {
    const supplier = await this.suppliersService.findByUserId(session.user.id)
    const subscription = await this.subscriptionsService.getCurrentSubscription(supplier.id)
    if (!subscription) {
      return { message: 'Aucun abonnement actif a mettre a niveau' }
    }
    return this.subscriptionsService.upgradeSubscription(subscription.id, body.newPlanId)
  }
}
