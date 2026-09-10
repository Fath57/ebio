import { Controller, Get, Query } from '@nestjs/common'
import { z } from 'zod'
import { Public } from '../auth/auth.decorator'
import { ProductMapper } from './products.mapper'
import { RecommendationsService } from './recommendations.service'

const querySchema = z.object({
  supplierId: z.string().uuid(),
  /** Comma-separated product ids already in the basket (or the product being viewed). */
  productIds: z.string().default(''),
  limit: z.coerce.number().int().min(1).max(8).default(4),
})

/** Public: the product page shows suggestions before any sign-in. */
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @Public()
  async list(@Query() raw: Record<string, string>) {
    const parsed = querySchema.safeParse(raw)
    if (!parsed.success) {
      return { items: [] }
    }
    const productIds = parsed.data.productIds.split(',').map(s => s.trim()).filter(s => /^[0-9a-f-]{36}$/i.test(s))
    const found = await this.recommendations.forBasket(parsed.data.supplierId, productIds, parsed.data.limit)
    const promotions = await this.recommendations.promotionTypes(found.map(r => r.product.id))
    return {
      items: found.map(r => ({
        ...ProductMapper.toSummary(r.product, promotions.get(r.product.id) ?? []),
        reason: r.reason,
      })),
    }
  }
}
