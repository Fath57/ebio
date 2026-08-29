import { MikroORM } from '@mikro-orm/postgresql'
import { Logger } from '@nestjs/common'
import { createMikroOrmOptions } from '../config/mikro-orm.config'
import { Product } from '../modules/products/entities/product.entity'
import { PRODUCT_COMPOSITION } from '../seeders/data/product-composition'

/**
 * Enriches the demo products of an EXISTING base with their composition
 * sheet (description, ingredients, allergens, labels, origin, conservation,
 * nutritional values) without reseeding. Idempotent: matches by name.
 *
 * Usage (after `nest build`): node dist/scripts/apply-product-composition.js
 */
async function main(): Promise<void> {
  const logger = new Logger('apply-product-composition')
  const orm = await MikroORM.init(createMikroOrmOptions())
  const em = orm.em.fork()
  let updated = 0
  for (const [name, composition] of Object.entries(PRODUCT_COMPOSITION)) {
    const products = await em.find(Product, { name })
    for (const product of products) {
      product.description = composition.description
      product.ingredients = composition.ingredients
      product.allergens = composition.allergens ?? []
      product.labels = composition.labels ?? []
      product.origin = composition.origin
      product.conservation = composition.conservation
      product.nutritionalValues = composition.nutritionalValues
      updated++
    }
    if (products.length === 0) {
      logger.warn(`Produit introuvable : ${name}`)
    }
  }
  await em.flush()
  logger.log(`${updated} produit(s) enrichi(s)`)
  await orm.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
