/* eslint-disable no-console */
import type { Dictionary } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { Category } from '../modules/products/entities/category.entity'

export class EbioSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    // ===== CATEGORIES =====
    const categoriesData = [
      { name: 'Huiles', slug: 'huiles', icon: '🫒', sortOrder: 1, imageUrl: 'https://images.unsplash.com/photo-1474979266404-7f28db8e8854?w=600&h=400&fit=crop' },
      { name: 'Céréales & Farines', slug: 'cereales', icon: '🌾', sortOrder: 2, imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&h=400&fit=crop' },
      { name: 'Légumes & Fruits', slug: 'legumes', icon: '🥬', sortOrder: 3, imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&h=400&fit=crop' },
      { name: 'Semences', slug: 'semences', icon: '🌱', sortOrder: 4, imageUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=400&fit=crop' },
      { name: 'Compost & Engrais', slug: 'compost', icon: '🪴', sortOrder: 5, imageUrl: 'https://images.unsplash.com/photo-1592419044706-39796d40f98c?w=600&h=400&fit=crop' },
      { name: 'Épices & Condiments', slug: 'epices', icon: '🌶️', sortOrder: 6, imageUrl: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&h=400&fit=crop' },
      { name: 'Boissons', slug: 'boissons', icon: '🥤', sortOrder: 7, imageUrl: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&h=400&fit=crop' },
      { name: 'Autres', slug: 'autres', icon: '📦', sortOrder: 8 },
    ]

    context.categories = {}
    for (const data of categoriesData) {
      const existing = await em.findOne(Category, { slug: data.slug })
      if (existing) {
        existing.name = data.name
        existing.icon = data.icon
        existing.sortOrder = data.sortOrder
        if (data.imageUrl)
          existing.imageUrl = data.imageUrl
        context.categories[data.slug] = existing
      }
      else {
        const cat = em.create(Category, {
          name: data.name,
          slug: data.slug,
          icon: data.icon,
          sortOrder: data.sortOrder,
          imageUrl: data.imageUrl,
        })
        context.categories[data.slug] = cat
      }
    }
    await em.flush()
    console.info(`Seeded ${categoriesData.length} product categories`)

    // ===== COMMISSION RATES (raw SQL — no entity) =====
    const db = em.getConnection()
    await db.execute(`CREATE TABLE IF NOT EXISTS commission_rates (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      category_slug varchar(50) UNIQUE NOT NULL,
      rate float NOT NULL,
      "createdAt" timestamptz DEFAULT NOW(),
      "updatedAt" timestamptz DEFAULT NOW()
    )`)
    for (const c of [
      { slug: 'huiles', rate: 0.04 },
      { slug: 'cereales', rate: 0.04 },
      { slug: 'legumes', rate: 0.04 },
      { slug: 'semences', rate: 0.025 },
      { slug: 'compost', rate: 0.03 },
      { slug: 'epices', rate: 0.04 },
      { slug: 'boissons', rate: 0.035 },
      { slug: 'autres', rate: 0.04 },
    ]) {
      await db.execute(
        `INSERT INTO commission_rates (category_slug, rate) VALUES (?, ?)
         ON CONFLICT (category_slug) DO UPDATE SET rate = ?`,
        [c.slug, c.rate, c.rate],
      )
    }
    console.info('Seeded 8 commission rates')
  }
}
