import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Category } from './entities/category.entity'

interface CreateCategoryInput {
  name: string
  slug: string
  icon?: string
  imageUrl?: string
  sortOrder?: number
}

interface UpdateCategoryInput {
  name?: string
  slug?: string
  icon?: string
  imageUrl?: string
  sortOrder?: number
}

@Injectable()
export class CategoriesService {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Category> {
    const category = await this.em.findOne(Category, { id })
    if (!category) {
      throw new NotFoundException('Category not found')
    }
    return category
  }

  async create(data: CreateCategoryInput): Promise<Category> {
    const category = this.em.create(Category, {
      name: data.name,
      slug: data.slug,
      icon: data.icon,
      imageUrl: data.imageUrl,
      sortOrder: data.sortOrder ?? 0,
    })
    await this.em.flush()
    return category
  }

  async update(id: string, data: UpdateCategoryInput): Promise<Category> {
    const category = await this.em.findOne(Category, { id })
    if (!category) {
      throw new NotFoundException('Category not found')
    }

    if (data.name !== undefined)
      category.name = data.name
    if (data.slug !== undefined)
      category.slug = data.slug
    if (data.icon !== undefined)
      category.icon = data.icon
    if (data.imageUrl !== undefined)
      category.imageUrl = data.imageUrl
    if (data.sortOrder !== undefined)
      category.sortOrder = data.sortOrder

    await this.em.flush()
    return category
  }

  async remove(id: string): Promise<void> {
    const category = await this.em.findOne(Category, { id })
    if (!category) {
      throw new NotFoundException('Category not found')
    }
    await this.em.removeAndFlush(category)
  }
}
