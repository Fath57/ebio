import type { BetterAuthSession, LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type {
  TerroirCatalogQuery,
  TerroirCatalogResponse,
  TerroirCheckoutInput,
  TerroirCheckoutPreview,
  TerroirCheckoutResult,
  TerroirDeparturesQuery,
  TerroirDeparturesResponse,
  TerroirDisplayQuery,
  TerroirPackDetail,
  TerroirProductDetail,
  TerroirShipmentDetail,
  TerroirShipmentSummary,
  TerroirTracking,
} from './contracts/terroir.contract'
import { TypedBody, TypedQueryObject } from '@lonestone/nzoth/server'
import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CanCreate } from '../../common/decorators/check-permissions.decorator'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { ExchangeRatesService } from '../currency/exchange-rates.service'
import {
  terroirCatalogQuerySchema,
  terroirCheckoutInputSchema,
  terroirDeparturesQuerySchema,
  terroirDisplayQuerySchema,
} from './contracts/terroir.contract'
import { ExportCatalogService } from './export-catalog.service'
import { ExportLogisticsService } from './export-logistics.service'
import { ExportShipmentsService } from './export-shipments.service'
import { TerroirCheckoutService } from './terroir-checkout.service'
import { TerroirEnabledGuard } from './terroir-enabled.guard'
import { TerroirMapper } from './terroir.mapper'

const MINUTE_MS = 60_000

/**
 * Terroir for buyers abroad (011, contracts §1–§3). Catalogue, departures
 * and checkout sit behind the platform switch (403 `TERROIR_DISABLED`);
 * a buyer's parcels and the public tracking do not, so paid parcels stay
 * followed to the end whatever the switch says (FR-000).
 */
@Controller('terroir')
@UseGuards(AuthGuard)
export class TerroirClientController {
  constructor(
    private readonly catalog: ExportCatalogService,
    private readonly logistics: ExportLogisticsService,
    private readonly checkout: TerroirCheckoutService,
    private readonly shipments: ExportShipmentsService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  // ===== CATALOGUE AND DEPARTURES =====

  @Public()
  @UseGuards(TerroirEnabledGuard)
  @Get('catalog')
  async getCatalog(@TypedQueryObject(terroirCatalogQuerySchema) query: TerroirCatalogQuery): Promise<TerroirCatalogResponse> {
    const catalog = await this.catalog.clientCatalog({ category: query.category, search: query.search, page: query.page })
    const rate = await this.exchangeRates.effectiveRate(query.currency)
    return TerroirMapper.toCatalog(catalog, query.country, query.page, query.currency, rate)
  }

  @Public()
  @UseGuards(TerroirEnabledGuard)
  @Get('products/:id')
  async getProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedQueryObject(terroirDisplayQuerySchema) query: TerroirDisplayQuery,
  ): Promise<TerroirProductDetail> {
    const view = await this.catalog.clientProduct(id)
    return TerroirMapper.toClientProduct(view, query.currency, await this.exchangeRates.effectiveRate(query.currency))
  }

  @Public()
  @UseGuards(TerroirEnabledGuard)
  @Get('packs/:id')
  async getPack(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedQueryObject(terroirDisplayQuerySchema) query: TerroirDisplayQuery,
  ): Promise<TerroirPackDetail> {
    const view = await this.catalog.clientPack(id)
    return TerroirMapper.toClientPack(view, query.currency, await this.exchangeRates.effectiveRate(query.currency))
  }

  /** The departures a parcel of `weightG` may take towards `country`, soonest first. */
  @Public()
  @UseGuards(TerroirEnabledGuard)
  @Get('departures')
  async getDepartures(
    @Session() session: BetterAuthSession,
    @TypedQueryObject(terroirDeparturesQuerySchema) query: TerroirDeparturesQuery,
  ): Promise<TerroirDeparturesResponse> {
    const { offers, departures } = await this.logistics.offerableDepartures(query.country, query.weightG)
    const points = await this.logistics.pickupPointsFor(offers, departures, query.country)
    const rate = await this.exchangeRates.effectiveRate(query.currency)
    const alertSubscribed = await this.logistics.hasPendingAlert(session?.user?.id, query.country)
    return TerroirMapper.toDepartures(offers, departures, points, rate, query.currency, alertSubscribed)
  }

  // ===== CHECKOUT =====

  @UseGuards(TerroirEnabledGuard)
  @Post('checkout/preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(terroirCheckoutInputSchema) body: TerroirCheckoutInput,
  ): Promise<TerroirCheckoutPreview> {
    return TerroirMapper.toPreview(await this.checkout.preview(session.user.id, body))
  }

  @UseGuards(TerroirEnabledGuard, CaslGuard)
  @CanCreate('Order')
  @Post('checkout')
  async create(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(terroirCheckoutInputSchema) body: TerroirCheckoutInput,
  ): Promise<TerroirCheckoutResult> {
    return TerroirMapper.toCheckoutResult(await this.checkout.create(session.user.id, body))
  }

  // ===== PARCELS (not behind the switch) =====

  @Get('shipments')
  async listShipments(@Session() session: LoggedInBetterAuthSession): Promise<TerroirShipmentSummary[]> {
    return (await this.shipments.listForBuyer(session.user.id)).map(TerroirMapper.toShipmentSummary)
  }

  @Get('shipments/:id')
  async getShipment(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TerroirShipmentDetail> {
    return TerroirMapper.toShipmentDetail(await this.shipments.detailForBuyer(session.user.id, id))
  }

  /**
   * The public page of a gifted parcel (US10), never a price. The landing
   * SSR loader calls it server-side, so every visitor shares one IP; the
   * 128-bit token makes guessing pointless, the ceiling only stops floods.
   */
  @Get('tracking/:token')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(1200, MINUTE_MS)
  async tracking(@Param('token') token: string): Promise<TerroirTracking> {
    return TerroirMapper.toTracking(await this.shipments.byToken(token))
  }
}
