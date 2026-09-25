import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { CartReminderSettings, CartSync } from './contracts/cart.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Put, Query, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { CartStatsService } from './cart-stats.service'
import { CartService } from './cart.service'
import { CheckoutAttemptsService } from './checkout-attempts.service'
import { cartReminderSettingsSchema, cartSyncSchema } from './contracts/cart.contract'

/** The buyer's own basket. */
@Controller('cart')
@UseGuards(AuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  /** What the server holds — read when the app starts on another phone. */
  @Get()
  async read(@Session() session: LoggedInBetterAuthSession) {
    return this.cart.read(session.user.id)
  }

  /**
   * Hands over the basket the app holds.
   *
   * A replacement rather than a list of changes: a basket is small, and
   * reconciling two histories is work nobody would thank us for getting
   * subtly right.
   */
  @Put()
  async sync(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(cartSyncSchema) body: CartSync,
  ) {
    return { items: await this.cart.sync(session.user.id, body) }
  }

  @Delete()
  async clear(@Session() session: LoggedInBetterAuthSession) {
    await this.cart.clear(session.user.id)
    return { cleared: true }
  }
}

/** What the back-office reads about baskets. */
@Controller('admin/carts')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminCartsController {
  constructor(
    private readonly stats: CartStatsService,
    private readonly cart: CartService,
    private readonly attempts: CheckoutAttemptsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** Counts and totals; nobody is named. */
  @CanRead('Settings')
  @Get('stats')
  async summary() {
    const hours = await this.settings.getCartReminderHours()
    return {
      abandonApresHeures: hours,
      ...(await this.stats.summary(hours)),
    }
  }

  /** When a forgotten basket draws a message, and how many times. */
  @CanRead('Settings')
  @Get('settings/reminders')
  async reminderSettings() {
    return {
      heures: await this.settings.getCartReminderHours(),
      relances: await this.settings.getCartReminderCount(),
    }
  }

  @CanManage('Settings')
  @Put('settings/reminders')
  async setReminderSettings(
    @TypedBody(cartReminderSettingsSchema) body: CartReminderSettings,
  ) {
    await this.settings.setCartReminderHours(body.heures)
    await this.settings.setCartReminderCount(body.relances)
    return {
      heures: await this.settings.getCartReminderHours(),
      relances: await this.settings.getCartReminderCount(),
    }
  }

  /**
   * One person's attempts, for whoever is on the phone with them.
   *
   * Under the orders permission rather than a basket one: it is about a
   * purchase that did not happen, and it names no product.
   */
  @CanRead('Order')
  @Get('attempts')
  async attemptsFor(@Query('userId') userId: string) {
    return { attempts: await this.attempts.listForUser(userId) }
  }

  /**
   * One person's basket, contents included.
   *
   * Behind `manage Settings` deliberately: this is the only place where
   * someone's basket is read by a third party, and it should take more than
   * being on the support rota.
   */
  @CanManage('Settings')
  @Get('of')
  async cartOf(@Query('userId') userId: string) {
    return this.cart.read(userId)
  }
}
