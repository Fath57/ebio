import { TypedBody } from '@lonestone/nzoth/server'
import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { CanCreate, CanDelete, CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { CategoriesService } from './categories.service'

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  icon: z.string().max(50).default('📦'),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().min(0).default(0),
}).meta({
  title: 'CreateCategory',
  description: 'Data required to create a new category',
})

const updateCategorySchema = createCategorySchema.partial().meta({
  title: 'UpdateCategory',
  description: 'Update category -- all fields optional',
})

@Controller('categories')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.categoriesService.findById(id)
  }

  @Post()
  @CanCreate('Category')
  async create(
    @TypedBody(createCategorySchema) body: z.infer<typeof createCategorySchema>,
  ) {
    return this.categoriesService.create(body)
  }

  @Patch(':id')
  @CanUpdate('Category')
  async update(
    @Param('id') id: string,
    @TypedBody(updateCategorySchema) body: z.infer<typeof updateCategorySchema>,
  ) {
    return this.categoriesService.update(id, body)
  }

  @Delete(':id')
  @CanDelete('Category')
  async remove(
    @Param('id') id: string,
  ) {
    await this.categoriesService.remove(id)
    return { success: true }
  }
}
