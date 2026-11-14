import type { BetterAuthSession, LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type {
  TerroirCatalogQuery,
  TerroirCatalogResponse,
  TerroirCheckoutInput,
  TerroirCheckoutPreview,
  TerroirCheckoutResult,
  TerroirCountriesQuery,
  TerroirCountry,
  TerroirDepartureAlertInput,
  TerroirDepartureAlertResponse,
  TerroirDeparturesQuery,
  TerroirDeparturesResponse,
  TerroirDisplayQuery,
  TerroirExportabilityQuery,
  TerroirExportabilityResponse,
  TerroirPackDetail,
  TerroirProductDetail,
  TerroirShipmentDetail,
  TerroirShipmentSummary,
  TerroirSupplementInput,
  TerroirSupplementResult,
  TerroirTracking,
} from './contracts/terroir.contract'
import { TypedBody, TypedQueryObject } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CanCreate } from '../../common/decorators/check-permissions.decorator'
import { RateLimit } from '../../common/decorators/rate-limit.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RateLimitGuard } from '../../common/guards/rate-limit.guard'
import { Public, Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { ExchangeRatesService } from '../currency/exchange-rates.service'
import {
  exportCountryCodeSchema,
  terroirCatalogQuerySchema,
  terroirCheckoutInputSchema,
  terroirCountriesQuerySchema,
  terroirDepartureAlertInputSchema,
  terroirDeparturesQuerySchema,
  terroirDisplayQuerySchema,
  terroirExportabilityQuerySchema,
  terroirSupplementInputSchema,
} from './contracts/terroir.contract'
import { ExportCatalogService } from './export-catalog.service'
import { ExportCountriesService } from './export-countries.service'
import { ExportLogisticsService } from './export-logistics.service'
import { ExportShipmentsService } from './export-shipments.service'
import { ExportSupplementService } from './export-supplement.service'
import { ExportabilityService } from './exportability.service'
import { TerroirCheckoutService } from './terroir-checkout.service'
import { TerroirEnabledGuard } from './terroir-enabled.guard'
import { terroirError } from './terroir-texts'
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
    private readonly supplements: ExportSupplementService,
    private readonly countries: ExportCountriesService,
    private readonly exportability: ExportabilityService,
  ) {}

  // ===== CATALOGUE AND DEPARTURES =====

  /**
   * Destination countries, by `sortOrder`: those an open departure serves,
   * or with `all=true` every active one (to subscribe to a departure alert).
   */
  @Public()
  @UseGuards(TerroirEnabledGuard)
  @Get('countries')
  async getCountries(@TypedQueryObject(terroirCountriesQuerySchema) query: TerroirCountriesQuery): Promise<TerroirCountry[]> {
    return (await this.countries.forClients(query.all === 'true')).map(TerroirMapper.toClientCountry)
  }

  @Public()
  @UseGuards(TerroirEnabledGuard)
  @Get('catalog')
  async getCatalog(@TypedQueryObject(terroirCatalogQuerySchema) query: TerroirCatalogQuery): Promise<TerroirCatalogResponse> {
    const country = await this.countries.requireActive(query.country)
    const currency = query.currency ?? country.displayCurrency
    const catalog = await this.catalog.clientCatalog({ category: query.category, search: query.search, page: query.page })
    const rate = await this.exchangeRates.effectiveRate(currency)
    return TerroirMapper.toCatalog(catalog, country.code, query.page, currency, rate)
  }

  /**
   * « Mode Valise »: whether products of the whole catalogue can go in the
   * suitcase towards `country`, one item per known id (unknown ids left out).
   */
  @Public()
  @UseGuards(TerroirEnabledGuard, RateLimitGuard)
  @RateLimit(600, MINUTE_MS)
  @Get('exportability')
  async getExportability(@TypedQueryObject(terroirExportabilityQuerySchema) query: TerroirExportabilityQuery): Promise<TerroirExportabilityResponse> {
    const { country, items } = await this.exportability.forProducts(query.country, query.productIds.split(','))
    return TerroirMapper.toExportabilityResponse(country.code, items)
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
    const country = await this.countries.requireActive(query.country)
    const currency = query.currency ?? country.displayCurrency
    const { offers, departures } = await this.logistics.offerableDepartures(country.code, query.weightG)
    const points = await this.logistics.pickupPointsFor(offers, departures, country.code)
    const rate = await this.exchangeRates.effectiveRate(currency)
    const alertSubscribed = await this.logistics.hasPendingAlert(session?.user?.id, country.code)
    return TerroirMapper.toDepartures(offers, departures, points, rate, currency, alertSubscribed)
  }

  /** « Me prévenir du prochain départ » (FR-032): sent once, at the next opening. */
  @UseGuards(TerroirEnabledGuard)
  @Post('departure-alerts')
  @HttpCode(HttpStatus.OK)
  async subscribeAlert(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(terroirDepartureAlertInputSchema) body: TerroirDepartureAlertInput,
  ): Promise<TerroirDepartureAlertResponse> {
    await this.logistics.subscribeAlert(session.user.id, body.country)
    return { country: body.country, subscribed: true }
  }

  @UseGuards(TerroirEnabledGuard)
  @Delete('departure-alerts/:country')
  async unsubscribeAlert(
    @Session() session: LoggedInBetterAuthSession,
    @Param('country') country: string,
  ): Promise<TerroirDepartureAlertResponse> {
    // Format only: an alert towards a country closed since can still be withdrawn.
    const parsed = exportCountryCodeSchema.safeParse(country)
    if (!parsed.success) {
      throw terroirError(HttpStatus.BAD_REQUEST, 'EXPORT_COUNTRY_UNKNOWN', 'Ce pays de destination n\'existe pas.')
    }
    await this.logistics.unsubscribeAlert(session.user.id, parsed.data)
    return { country: parsed.data, subscribed: false }
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
    const views = await this.shipments.listForBuyer(session.user.id)
    const names = await this.countryNames(views.map(view => view.shipment.country))
    return views.map(view => ({ ...TerroirMapper.toShipmentSummary(view), countryInfo: names.get(view.shipment.country) ?? null }))
  }

  @Get('shipments/:id')
  async getShipment(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TerroirShipmentDetail> {
    const view = await this.shipments.detailForBuyer(session.user.id, id)
    const names = await this.countryNames([view.shipment.country])
    return { ...TerroirMapper.toShipmentDetail(view), countryInfo: names.get(view.shipment.country) ?? null }
  }

  /** The words for each destination, whatever the country's state today. */
  private async countryNames(codes: string[]): Promise<Map<string, NonNullable<TerroirShipmentSummary['countryInfo']>>> {
    const unique = [...new Set(codes)]
    const found = await Promise.all(unique.map(code => this.countries.find(code)))
    return new Map(found.filter(country => country !== null).map(country => [
      country.code,
      { name: country.name, toPhrase: country.toPhrase, inPhrase: country.inPhrase, flagEmoji: country.flagEmoji ?? null },
    ]))
  }

  /**
   * The buyer's answer to a weight supplement: PAY (wallet, or card through
   * a wallet top-up whose page comes back here) or REMOVE_ITEM (refunded).
   * Not behind the switch: a paid parcel is followed to the end.
   */
  @Post('shipments/:id/supplement')
  @HttpCode(HttpStatus.OK)
  async supplement(
    @Session() session: LoggedInBetterAuthSession,
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(terroirSupplementInputSchema) body: TerroirSupplementInput,
  ): Promise<TerroirSupplementResult> {
    return TerroirMapper.toSupplementResult(await this.supplements.choose(session.user.id, id, body))
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
