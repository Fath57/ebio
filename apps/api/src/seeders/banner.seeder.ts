/* eslint-disable no-console */
import type { EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { Banner, BannerTargetType } from '../modules/banners/banner.entity'
import { Product, ProductStatus } from '../modules/products/entities/product.entity'
import { Supplier, ValidationStatus } from '../modules/suppliers/supplier.entity'

/** Au-delà, le carrousel de l'accueil n'affiche plus rien de toute façon. */
const MAX_SEEDED = 3

/**
 * Bannières de démarrage.
 *
 * Idempotent et sans identifiant codé en dur : les cibles sont choisies dans la
 * base au moment de l'exécution. Ce seeder peut donc être rejoué seul sur un
 * environnement déjà peuplé — production comprise — sans rien dupliquer :
 *
 *   pnpm exec mikro-orm seeder:run --class=BannerSeeder
 */
export class BannerSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const existing = await em.count(Banner, {})
    if (existing > 0) {
      console.info(`  ${existing} bannière(s) déjà présente(s), rien à créer`)
      return
    }

    const created: string[] = []

    // 1. Un produit en promotion : c'est la mise en avant la plus utile.
    const promo = await em.findOne(
      Product,
      { promotionalPrice: { $ne: null }, status: ProductStatus.ACTIVE },
      { populate: ['supplier'], orderBy: { createdAt: 'DESC' } },
    )
    if (promo && promo.photos?.length) {
      em.create(Banner, {
        title: promo.name,
        subtitle: promo.supplier?.shopName,
        imageUrl: promo.photos[0],
        targetType: BannerTargetType.PRODUCT,
        targetId: promo.id,
        position: created.length,
      })
      created.push(`produit « ${promo.name} »`)
    }

    // 2. Les fournisseurs validés les mieux notés, avec une photo de couverture.
    const suppliers = await em.find(
      Supplier,
      { validationStatus: ValidationStatus.VALIDATED, coverPhoto: { $ne: null } },
      { orderBy: { globalRating: 'DESC' }, limit: MAX_SEEDED },
    )

    for (const supplier of suppliers) {
      if (created.length >= MAX_SEEDED) {
        break
      }
      em.create(Banner, {
        title: supplier.shopName,
        subtitle: supplier.neighborhood ?? supplier.address,
        imageUrl: supplier.coverPhoto!,
        targetType: BannerTargetType.SUPPLIER,
        targetId: supplier.id,
        position: created.length,
      })
      created.push(`fournisseur « ${supplier.shopName} »`)
    }

    if (created.length === 0) {
      console.warn('  Aucune cible exploitable (produit en promo ou fournisseur avec couverture)')
      return
    }

    await em.flush()
    console.info(`  ${created.length} bannière(s) créée(s) : ${created.join(', ')}`)
  }
}
