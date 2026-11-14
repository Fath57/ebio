import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import type { ExportPackInput, ExportPackResponse, ExportProfileInput, ExportProfileResponse, UpdateExportPack } from './contracts/terroir.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { ActiveSupplierGuard } from '../../common/guards/active-supplier.guard'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuditService } from '../admin/audit.service'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { CaslAbilityFactory } from '../auth/casl/casl-ability.factory'
import { SuppliersService } from '../suppliers/suppliers.service'
import { exportPackInputSchema, exportProfileInputSchema, updateExportPackSchema } from './contracts/terroir.contract'
import { ExportCatalogService } from './export-catalog.service'
import { TerroirMapper } from './terroir.mapper'

/**
 * A shop's export requests and packs (011, contracts §4). `me` is the shop
 * owner; another id is eBio working inside a shop's catalogue, which takes
 * `manage Product` and is written down — as for the products themselves.
 * Not behind the platform switch: shops prepare their catalogue before the
 * opening.
 */
@Controller('suppliers/:supplierId')
@UseGuards(AuthGuard, ActiveSupplierGuard, RolesGuard, CaslGuard)
export class SupplierExportController {
  constructor(
    private readonly catalog: ExportCatalogService,
    private readonly suppliers: SuppliersService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly audit: AuditService,
  ) {}

  /** The current export request of a product; null when none was made. */
  @CanUpdate('Product')
  @Get('products/:id/export')
  async getProfile(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExportProfileResponse | null> {
    const shop = await this.resolveShop(session, supplierId)
    const profile = await this.catalog.getProfile(shop.id, id)
    return profile ? TerroirMapper.toProfile(profile) : null
  }

  @CanUpdate('Product')
  @Put('products/:id/export')
  async upsertProfile(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(exportProfileInputSchema) body: ExportProfileInput,
  ): Promise<ExportProfileResponse> {
    const shop = await this.resolveShop(session, supplierId)
    const profile = await this.catalog.upsertProfile(shop.id, id, body)
    this.noteOnBehalf(session, shop, 'EXPORT_PROFILE_SET_ON_BEHALF', 'product', id)
    return TerroirMapper.toProfile(profile)
  }

  @CanUpdate('Product')
  @Delete('products/:id/export')
  async removeProfile(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ removed: true }> {
    const shop = await this.resolveShop(session, supplierId)
    await this.catalog.removeProfile(shop.id, id)
    this.noteOnBehalf(session, shop, 'EXPORT_PROFILE_REMOVED_ON_BEHALF', 'product', id)
    return { removed: true }
  }

  @CanUpdate('Product')
  @Get('export-packs')
  async listPacks(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
  ): Promise<ExportPackResponse[]> {
    const shop = await this.resolveShop(session, supplierId)
    return (await this.catalog.listPacks(shop.id)).map(TerroirMapper.toPack)
  }

  @CanUpdate('Product')
  @Post('export-packs')
  async createPack(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @TypedBody(exportPackInputSchema) body: ExportPackInput,
  ): Promise<ExportPackResponse> {
    const shop = await this.resolveShop(session, supplierId)
    const view = await this.catalog.createPack(shop.id, body, session.user.id)
    this.noteOnBehalf(session, shop, 'EXPORT_PACK_CREATED_ON_BEHALF', 'export_pack', view.pack.id)
    return TerroirMapper.toPack(view)
  }

  @CanUpdate('Product')
  @Patch('export-packs/:id')
  async updatePack(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(updateExportPackSchema) body: UpdateExportPack,
  ): Promise<ExportPackResponse> {
    const shop = await this.resolveShop(session, supplierId)
    const view = await this.catalog.updatePack(shop.id, id, body, session.user.id)
    this.noteOnBehalf(session, shop, 'EXPORT_PACK_UPDATED_ON_BEHALF', 'export_pack', id)
    return TerroirMapper.toPack(view)
  }

  @CanUpdate('Product')
  @Delete('export-packs/:id')
  async retirePack(
    @Session() session: LoggedInBetterAuthSession,
    @Param('supplierId') supplierId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExportPackResponse> {
    const shop = await this.resolveShop(session, supplierId)
    const view = await this.catalog.retirePack(shop.id, id, session.user.id)
    this.noteOnBehalf(session, shop, 'EXPORT_PACK_RETIRED_ON_BEHALF', 'export_pack', id)
    return TerroirMapper.toPack(view)
  }

  /** Same rule as ProductsController.resolveShop. */
  private async resolveShop(session: LoggedInBetterAuthSession, supplierId: string): Promise<{ id: string, onBehalf: boolean }> {
    if (supplierId === 'me') {
      const own = await this.suppliers.findByUserId(session.user.id)
      return { id: own.id, onBehalf: false }
    }
    const ability = await this.caslAbilityFactory.createForUser(session.user as never)
    if (!ability.can('manage', 'Product')) {
      throw new ForbiddenException('Vous ne pouvez pas modifier le catalogue d\'une autre boutique')
    }
    const shop = await this.suppliers.findById(supplierId)
    return { id: shop.id, onBehalf: true }
  }

  private noteOnBehalf(session: LoggedInBetterAuthSession, shop: { id: string, onBehalf: boolean }, action: string, targetType: 'product' | 'export_pack', targetId: string): void {
    if (!shop.onBehalf) {
      return
    }
    void this.audit.record({ actorUserId: session.user.id, action, targetType, targetId, payload: { supplierId: shop.id } })
  }
}
