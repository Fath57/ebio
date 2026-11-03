import type { ProductModerationActionInput } from './contracts/product.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { productModerationActionSchema } from './contracts/product.contract'
import { ProductModerationService } from './product-moderation.service'

/**
 * eBio's decisions on a product: approve or refuse a new one, withdraw one
 * from the apps, put it back. The shop is told each time, with the reason.
 */
@Controller('admin/catalogue')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminProductModerationController {
  constructor(private readonly moderation: ProductModerationService) {}

  @CanManage('Product')
  @Post(':id/moderation')
  async decide(
    @Param('id', ParseUUIDPipe) id: string,
    @TypedBody(productModerationActionSchema) body: ProductModerationActionInput,
  ) {
    const product = await this.moderation.decide(id, body.action, body.reason)
    return {
      id: product.id,
      moderationStatus: product.moderationStatus,
      moderationReason: product.moderationReason ?? null,
      moderatedAt: product.moderatedAt?.toISOString() ?? null,
    }
  }
}
