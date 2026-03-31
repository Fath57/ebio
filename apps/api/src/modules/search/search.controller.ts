import type { SearchProductsQuery, SearchResponse } from './contracts/search.contract'
import { TypedQueryObject, TypedRoute } from '@lonestone/nzoth/server'
import { Controller } from '@nestjs/common'
import { z } from 'zod'
import { Public } from '../../common/decorators/public.decorator'
import {
  autocompleteQuerySchema,
  autocompleteResponseSchema,
  categoriesResponseSchema,

  searchProductsQuerySchema,

  searchResponseSchema,
} from './contracts/search.contract'
import { SearchService } from './search.service'

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @TypedRoute.Get('products', searchResponseSchema)
  async searchProducts(
    @TypedQueryObject(searchProductsQuerySchema) query: SearchProductsQuery,
  ): Promise<SearchResponse> {
    return this.searchService.searchProducts(query)
  }

  @Public()
  @TypedRoute.Get('autocomplete', autocompleteResponseSchema)
  async autocomplete(
    @TypedQueryObject(autocompleteQuerySchema) query: z.infer<typeof autocompleteQuerySchema>,
  ) {
    return this.searchService.autocomplete(query)
  }

  @Public()
  @TypedRoute.Get('categories', categoriesResponseSchema)
  async getCategories() {
    return this.searchService.getCategories()
  }
}
