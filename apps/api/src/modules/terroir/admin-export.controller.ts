import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type {
  CancelExportDeparture,
  CancelExportDepartureResult,
  CollectExportShipment,
  CreateExportDeparture,
  ExportAdminShipment,
  ExportAgencyInput,
  ExportAgencyResponse,
  ExportDepartureDetail,
  ExportDepartureEventInput,
  ExportDepartureEventResult,
  ExportDepartureResponse,
  ExportDeparturesQuery,
  ExportPackInput,
  ExportPackResponse,
  ExportPickupPointInput,
  ExportPickupPointResponse,
  ExportProfileResponse,
  ExportReviewsQuery,
  ExportReviewsResponse,
  ExportShipmentEventInput,
  LostExportShipment,
  MissingExportItem,
  ReviewExportPack,
  ReviewExportProduct,
  UpdateExportAgency,
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
  cancelExportDepartureSchema,
  collectExportShipmentSchema,
  createExportDepartureSchema,
  exportAgencyInputSchema,
  exportDepartureEventInputSchema,
  exportDeparturesQuerySchema,
  exportPackInputSchema,
  exportPickupPointInputSchema,
  exportReviewsQuerySchema,
  exportShipmentEventInputSchema,
  lostExportShipmentSchema,
  missingExportItemSchema,
  reviewExportPackSchema,
  reviewExportProductSchema,
  updateExportAgencySchema,
  updateExportDepartureSchema,
  updateExportPackSchema,
  updateExportPickupPointSchema,
  weighExportShipmentSchema,
} from './contracts/terroir.contract'
import { ExportCatalogService } from './export-catalog.service'
import { ExportLogisticsService } from './export-logistics.service'
import { ExportShipmentsService } from './export-shipments.service'
import { TerroirMapper } from './terroir.mapper'

/**
 * Terroir export in the back office (011, contracts §5): agencies, pickup
 * points, departures, product and pack reviews, eBio's own packs. Not behind
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
  ) {}

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

  // ===== REVIEWS =====

  @CanRead('Product')
  @Get('reviews')
  async reviews(@TypedQueryObject(exportReviewsQuerySchema) query: ExportReviewsQuery): Promise<ExportReviewsResponse> {
    return TerroirMapper.toReviews(await this.catalog.reviewQueue(query.status))
  }

  @CanManage('Product')
  @Post('products/:id/review')
  async reviewProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(reviewExportProductSchema) body: ReviewExportProduct,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportProfileResponse> {
    return TerroirMapper.toProfile(await this.catalog.review(id, body, session.user.id))
  }

  @CanManage('Product')
  @Post('packs/:id/review')
  async reviewPack(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(reviewExportPackSchema) body: ReviewExportPack,
    @Session() session: LoggedInBetterAuthSession,
  ): Promise<ExportPackResponse> {
    return TerroirMapper.toPack(await this.catalog.reviewPack(id, body, session.user.id))
  }

  // ===== EBIO PACKS =====

  @CanRead('Product')
  @Get('packs')
  async listPacks(): Promise<ExportPackResponse[]> {
    return (await this.catalog.listPacks(null)).map(TerroirMapper.toPack)
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
