import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type {
  AdminExportPacksQuery,
  AdminExportProduct,
  AdminExportProductsQuery,
  AdminExportProductsResponse,
  CancelExportDeparture,
  CancelExportDepartureResult,
  CollectExportShipment,
  CreateExportDeparture,
  ExportAdminShipment,
  ExportAgencyInput,
  ExportAgencyResponse,
  ExportCountryAdmin,
  ExportCountryInput,
  ExportDepartureDetail,
  ExportDepartureEventInput,
  ExportDepartureEventResult,
  ExportDepartureResponse,
  ExportDeparturesQuery,
  ExportPackInput,
  ExportPackResponse,
  ExportPickupPointInput,
  ExportPickupPointResponse,
  ExportShipmentEventInput,
  ExportWithdraw,
  LostExportShipment,
  MissingExportItem,
  UpdateExportAgency,
  UpdateExportCountry,
  UpdateExportDeparture,
  UpdateExportPack,
  UpdateExportPickupPoint,
  WeighExportShipment,
} from './contracts/terroir.contract'
import { TypedBody, TypedQueryObject } from '@lonestone/nzoth/server'
import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import {
  adminExportPacksQuerySchema,
  adminExportProductsQuerySchema,
  cancelExportDepartureSchema,
  collectExportShipmentSchema,
  createExportDepartureSchema,
  exportAgencyInputSchema,
  exportCountryInputSchema,
  exportDepartureEventInputSchema,
  exportDeparturesQuerySchema,
  exportPackInputSchema,
  exportPickupPointInputSchema,
  exportShipmentEventInputSchema,
  exportWithdrawSchema,
  lostExportShipmentSchema,
  missingExportItemSchema,
  updateExportAgencySchema,
  updateExportCountrySchema,
  updateExportDepartureSchema,
  updateExportPackSchema,
  updateExportPickupPointSchema,
  weighExportShipmentSchema,
} from './contracts/terroir.contract'
import { ExportCatalogService } from './export-catalog.service'
import { ExportCountriesService } from './export-countries.service'
import { ExportCriteriaService } from './export-criteria.service'
import { ExportLogisticsService } from './export-logistics.service'
import { ExportShipmentsService } from './export-shipments.service'
import { TerroirMapper } from './terroir.mapper'

/**
 * Terroir export in the back office (011, contracts §5): agencies, pickup
 * points, departures, the watch over exportable products and packs
 * (withdraw, reinstate: validation itself is automatic), eBio's own packs. Not behind
 * the platform switch: eBio prepares the opening with the module closed.
 */
@Controller('admin/export')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminExportController {
  constructor(
    private readonly logistics: ExportLogisticsService,
    private readonly catalog: ExportCatalogService,
    private readonly shipments: ExportShipmentsService,
    private readonly countries: ExportCountriesService,
    private readonly criteria: ExportCriteriaService,
  ) {}

  // ===== DESTINATION COUNTRIES =====

  /** Every country, active or not, with its pickup points, open departures and parcels in transit. */
  @CanRead('Delivery')
  @Get('countries')
  async listCountries(): Promise<ExportCountryAdmin[]> {
    return (await this.countries.listForAdmin()).map(TerroirMapper.toAdminCountry)
  }

  @CanManage('Delivery')
  @Post('countries')
  async createCountry(
    @TypedBody(exportCountryInputSchema) body: ExportCountryInput,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportCountryAdmin> {
    return TerroirMapper.toAdminCountry(await this.countries.create(body, session.user.id))
  }

  /** Everything but the code. `isActive: false` closes it to new parcels; a country is never deleted. */
  @CanManage('Delivery')
  @Patch('countries/:code')
  async updateCountry(
    @Param('code') code: string,
    @TypedBody(updateExportCountrySchema) body: UpdateExportCountry,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportCountryAdmin> {
    return TerroirMapper.toAdminCountry(await this.countries.update(code, body, session.user.id))
  }

  // ===== AGENCIES =====

  @CanRead('Delivery')
  @Get('agencies')
  async listAgencies(): Promise<ExportAgencyResponse[]> {
    return (await this.logistics.listAgencies()).map(TerroirMapper.toAgency)
  }

  @CanManage('Delivery')
  @Post('agencies')
  async createAgency(
    @TypedBody(exportAgencyInputSchema) body: ExportAgencyInput,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportAgencyResponse> {
    return TerroirMapper.toAgency(await this.logistics.createAgency(body, session.user.id))
  }

  @CanManage('Delivery')
  @Patch('agencies/:id')
  async updateAgency(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(updateExportAgencySchema) body: UpdateExportAgency,
  ): Promise<ExportAgencyResponse> {
    return TerroirMapper.toAgency(await this.logistics.updateAgency(id, body))
  }

  @CanRead('Delivery')
  @Get('agencies/:id/pickup-points')
  async listPickupPoints(@Param('id', ParseUUIDPipe) id: string): Promise<ExportPickupPointResponse[]> {
    return (await this.logistics.listPickupPoints(id)).map(TerroirMapper.toPickupPoint)
  }

  @CanManage('Delivery')
  @Post('agencies/:id/pickup-points')
  async createPickupPoint(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(exportPickupPointInputSchema) body: ExportPickupPointInput,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportPickupPointResponse> {
    return TerroirMapper.toPickupPoint(await this.logistics.createPickupPoint(id, body, session.user.id))
  }

  @CanManage('Delivery')
  @Patch('agencies/:id/pickup-points/:pointId')
  async updatePickupPoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
    @TypedBody(updateExportPickupPointSchema) body: UpdateExportPickupPoint,
  ): Promise<ExportPickupPointResponse> {
    return TerroirMapper.toPickupPoint(await this.logistics.updatePickupPoint(id, pointId, body))
  }

  // ===== DEPARTURES =====

  @CanRead('Delivery')
  @Get('departures')
  async listDepartures(@TypedQueryObject(exportDeparturesQuerySchema) query: ExportDeparturesQuery): Promise<ExportDepartureResponse[]> {
    return (await this.logistics.listDepartures(query.status)).map(TerroirMapper.toDeparture)
  }

  @CanManage('Delivery')
  @Post('departures')
  async createDeparture(
    @TypedBody(createExportDepartureSchema) body: CreateExportDeparture,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportDepartureResponse> {
    return TerroirMapper.toDeparture(await this.logistics.createDeparture(body, session.user.id))
  }

  @CanRead('Delivery')
  @Get('departures/:id')
  async departureDetail(@Param('id', ParseUUIDPipe) id: string): Promise<ExportDepartureDetail> {
    return TerroirMapper.toDepartureDetail(await this.logistics.detail(id))
  }

  @CanManage('Delivery')
  @Patch('departures/:id')
  async updateDeparture(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(updateExportDepartureSchema) body: UpdateExportDeparture,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportDepartureResponse> {
    return TerroirMapper.toDeparture(await this.logistics.updateDeparture(id, body, session.user.id))
  }

  @CanManage('Delivery')
  @Post('departures/:id/cancel')
  async cancelDeparture(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(cancelExportDepartureSchema) body: CancelExportDeparture,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<CancelExportDepartureResult> {
    const result = await this.logistics.cancel(id, body.reassignTo, session.user.id)
    return { departure: TerroirMapper.toDeparture(result.view), reassigned: result.reassigned, surcharge: result.surcharge }
  }

  /** The printable list for the agency (FR-021): HTML, opened in a tab and printed. */
  @CanRead('Delivery')
  @Get('departures/:id/manifest')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async manifest(@Param('id', ParseUUIDPipe) id: string): Promise<string> {
    return this.shipments.manifestHtml(id)
  }

  /** One step for every parcel of the departure (FR-024). */
  @CanManage('Delivery')
  @Post('departures/:id/events')
  @HttpCode(HttpStatus.OK)
  async departureEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(exportDepartureEventInputSchema) body: ExportDepartureEventInput,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportDepartureEventResult> {
    return this.shipments.addDepartureEvent(id, body, session.user.id)
  }

  // ===== PARCELS =====

  @CanRead('Delivery')
  @Get('shipments/:id')
  async shipment(@Param('id', ParseUUIDPipe) id: string): Promise<ExportAdminShipment> {
    return TerroirMapper.toAdminShipment(await this.shipments.adminDetail(id))
  }

  /** A shop's products collected: its order DELIVERED, its escrow released at once. */
  @CanManage('Delivery')
  @Post('shipments/:id/collect')
  @HttpCode(HttpStatus.OK)
  async collect(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(collectExportShipmentSchema) body: CollectExportShipment,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportAdminShipment> {
    return TerroirMapper.toAdminShipment(await this.shipments.collect(id, body.supplierId, session.user.id))
  }

  @CanManage('Delivery')
  @Post('shipments/:id/missing')
  @HttpCode(HttpStatus.OK)
  async missing(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(missingExportItemSchema) body: MissingExportItem,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportAdminShipment> {
    return TerroirMapper.toAdminShipment(await this.shipments.missing(id, body.orderItemId, session.user.id))
  }

  @CanManage('Delivery')
  @Post('shipments/:id/weigh')
  @HttpCode(HttpStatus.OK)
  async weigh(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(weighExportShipmentSchema) body: WeighExportShipment,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportAdminShipment> {
    return TerroirMapper.toAdminShipment(await this.shipments.weigh(id, body.actualWeightG, session.user.id))
  }

  @CanManage('Delivery')
  @Post('shipments/:id/events')
  @HttpCode(HttpStatus.OK)
  async shipmentEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(exportShipmentEventInputSchema) body: ExportShipmentEventInput,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportAdminShipment> {
    return TerroirMapper.toAdminShipment(await this.shipments.addEvent(id, body, session.user.id))
  }

  @CanManage('Delivery')
  @Post('shipments/:id/handed-over')
  @HttpCode(HttpStatus.OK)
  async handedOver(
    @Param('id', ParseUUIDPipe) id: string,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportAdminShipment> {
    return TerroirMapper.toAdminShipment(await this.shipments.handedOver(id, session.user.id))
  }

  /** Lost (`damaged: false`) or damaged: refunded without return, the shops not debited. */
  @CanManage('Delivery')
  @Post('shipments/:id/lost')
  @HttpCode(HttpStatus.OK)
  async lost(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(lostExportShipmentSchema) body: LostExportShipment,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportAdminShipment> {
    return TerroirMapper.toAdminShipment(await this.shipments.lost(id, body.damaged, session.user.id))
  }

  // ===== EXPORT WATCH =====

  /** Products offered for export, every status, with what each one misses. */
  @CanRead('Product')
  @Get('products')
  async listProducts(@TypedQueryObject(adminExportProductsQuerySchema) query: AdminExportProductsQuery): Promise<AdminExportProductsResponse> {
    const [page, thresholds] = await Promise.all([this.catalog.listForAdmin(query), this.criteria.settings()])
    return TerroirMapper.toAdminExportProducts(page, thresholds)
  }

  /** Takes a product off the export whatever its criteria; the shop gets the reason. */
  @CanManage('Product')
  @Post('products/:productId/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdrawProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @TypedBody(exportWithdrawSchema) body: ExportWithdraw,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<AdminExportProduct> {
    const profile = await this.catalog.withdraw(productId, body.reason, session.user.id)
    return TerroirMapper.toAdminExportProduct(profile, await this.criteria.settings())
  }

  /** Lifts the withdrawal: exportable again at once if every criterion is met. */
  @CanManage('Product')
  @Post('products/:productId/reinstate')
  @HttpCode(HttpStatus.OK)
  async reinstateProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<AdminExportProduct> {
    const profile = await this.catalog.reinstate(productId, session.user.id)
    return TerroirMapper.toAdminExportProduct(profile, await this.criteria.settings())
  }

  @CanManage('Product')
  @Post('packs/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdrawPack(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(exportWithdrawSchema) body: ExportWithdraw,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportPackResponse> {
    return TerroirMapper.toPack(await this.catalog.withdrawPack(id, body.reason, session.user.id))
  }

  @CanManage('Product')
  @Post('packs/:id/reinstate')
  @HttpCode(HttpStatus.OK)
  async reinstatePack(
    @Param('id', ParseUUIDPipe) id: string,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportPackResponse> {
    return TerroirMapper.toPack(await this.catalog.reinstatePack(id, session.user.id))
  }

  // ===== EBIO PACKS =====

  /** eBio's own packs; `?scope=all` adds the shops' packs (export watch), `?status=` filters. */
  @CanRead('Product')
  @Get('packs')
  async listPacks(@TypedQueryObject(adminExportPacksQuerySchema) query: AdminExportPacksQuery): Promise<ExportPackResponse[]> {
    return (await this.catalog.listPacksForAdmin(query)).map(TerroirMapper.toPack)
  }

  @CanRead('Product')
  @Get('packs/:id')
  async getPack(@Param('id', ParseUUIDPipe) id: string): Promise<ExportPackResponse> {
    return TerroirMapper.toPack(await this.catalog.getPack(id))
  }

  @CanManage('Product')
  @Post('packs')
  async createPack(
    @TypedBody(exportPackInputSchema) body: ExportPackInput,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportPackResponse> {
    return TerroirMapper.toPack(await this.catalog.createPack(null, body, session.user.id))
  }

  @CanManage('Product')
  @Patch('packs/:id')
  async updatePack(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(updateExportPackSchema) body: UpdateExportPack,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportPackResponse> {
    return TerroirMapper.toPack(await this.catalog.updatePack(null, id, body, session.user.id))
  }

  @CanManage('Product')
  @Delete('packs/:id')
  async retirePack(
    @Param('id', ParseUUIDPipe) id: string,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportPackResponse> {
    return TerroirMapper.toPack(await this.catalog.retirePack(null, id, session.user.id))
  }
}
