import type { ProductDetailProduct, ProductDetailSupplier } from './components/product-detail-screen'

/**
 * Traduction des réponses de l'API vers ce que la fiche produit attend.
 *
 * Les deux mondes ne parlent pas le même langage — l'API renvoie `stock`,
 * `globalRating`, `validationStatus`, l'écran attend `isInStock`, `rating`,
 * `isValidated`. Recopier la réponse telle quelle laissait ces champs
 * indéfinis : la boutique perdait sa note et **tous** les produits
 * s'affichaient en rupture, sans la moindre erreur. Le passage obligé par ces
 * fonctions fait échouer la compilation quand un champ manque ou change de nom.
 *
 * Le mobile appelle l'API en `fetch` brut, sans SDK généré : les interfaces
 * ci-dessous sont donc écrites à la main, réduites aux champs consommés.
 */

/** `GET /api/products/:id` — champs utilisés par la fiche. */
export interface ApiProductDetail {
  id: string
  name: string
  photos?: string[] | null
  pricePerUnit: number
  promotionalPrice?: number | null
  promotionTypes?: string[]
  unit: string
  stock?: number
  categoryName?: string
  description?: string
  supplierId: string
}

/** `GET /api/suppliers/:id` — champs utilisés par la fiche. */
export interface ApiSupplierDetail {
  id: string
  shopName: string
  globalRating?: number | null
  totalReviews?: number
  mode: 'CONTACT' | 'ORDER'
  validationStatus: string
  profilePhoto?: string | null
}

/** Même définition que le serveur (`search.service.ts` : `inStock: stock > 0`). */
export function toDetailProduct(raw: ApiProductDetail): ProductDetailProduct {
  return {
    id: raw.id,
    name: raw.name,
    imageUrl: raw.photos?.[0] ?? null,
    pricePerUnit: raw.pricePerUnit,
    promotionalPrice: raw.promotionalPrice ?? null,
    promotionTypes: raw.promotionTypes,
    unit: raw.unit,
    isInStock: (raw.stock ?? 0) > 0,
    categoryName: raw.categoryName,
    description: raw.description,
    stock: raw.stock,
  }
}

/**
 * `distance` est volontairement absente : l'endpoint boutique ne la calcule
 * pas, et la fiche masque la puce plutôt que d'afficher une distance fausse.
 */
export function toDetailSupplier(raw: ApiSupplierDetail): ProductDetailSupplier {
  return {
    id: raw.id,
    shopName: raw.shopName,
    rating: raw.globalRating ?? null,
    reviewCount: raw.totalReviews,
    mode: raw.mode,
    isValidated: raw.validationStatus === 'VALIDATED',
    profilePhoto: raw.profilePhoto ?? null,
  }
}
