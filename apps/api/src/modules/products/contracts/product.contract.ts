import {
  createFilterQueryStringSchema,
  createPaginationQuerySchema,
  paginatedSchema,
} from '@lonestone/nzoth/server'
import { z } from 'zod'
import { exportProfileStatusEnum } from '../../terroir/contracts/terroir.contract'
import { ALLERGEN_CODES } from '../composition.constants'
import { certificationCodeSchema } from './certification.contract'

/** The owner's view of a product's export request (011); absent for anyone else. */
export const productExportProfileSchema = z.object({
  status: exportProfileStatusEnum,
  rejectionReason: z.string().nullable(),
  packedWeightG: z.number(),
  lengthCm: z.number().nullable(),
  widthCm: z.number().nullable(),
  heightCm: z.number().nullable(),
  shelfLifeDays: z.number(),
  origin: z.object({
    producer: z.string().nullable(),
    place: z.string().nullable(),
    year: z.number().nullable(),
    method: z.string().nullable(),
    photos: z.array(z.string()),
  }),
  labelPhoto: z.string().nullable(),
}).meta({
  title: 'ProductExportProfile',
  description: 'Demande d\'export du produit, vue par sa boutique',
})

export type ProductExportProfile = z.infer<typeof productExportProfileSchema>

/**
 * Free-form code rather than an enum: the list of units is managed from the
 * backoffice, and a schema frozen at build time would reject every unit added
 * after it. `ProductUnitsService` checks the code against the table.
 */
export const productUnitCode = z.string().min(1).max(32).meta({
  title: 'ProductUnitCode',
  description: 'Code of a unit of sale, from the product units reference list',
})

export const productStatusEnum = z.enum(['ACTIVE', 'OUT_OF_STOCK', 'HIDDEN']).meta({
  title: 'ProductStatus',
  description: 'Product visibility and availability status',
})

export const productModerationEnum = z.enum(['APPROVED', 'PENDING', 'REJECTED', 'WITHDRAWN']).meta({
  title: 'ProductModeration',
  description: 'eBio review of the product: approved, waiting, refused or withdrawn from the apps',
})

/** An eBio decision on a product. The reason is required to refuse or withdraw. */
export const productModerationActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'withdraw', 'restore']),
  reason: z.string().trim().max(500).optional(),
}).meta({
  title: 'ProductModerationAction',
  description: 'Valider, refuser, retirer ou remettre en ligne un produit',
})

export type ProductModerationActionInput = z.infer<typeof productModerationActionSchema>

const variantInputSchema = z.object({
  label: z.string().min(1).max(100),
  pricePerUnit: z.number().min(0),
  stock: z.number().int().min(0).optional(),
  /** Units in one pack; set, the format draws from the product's stock and `stock` is ignored. */
  packSize: z.number().int().min(2).max(1000).nullable().optional(),
})

export const allergenCodeEnum = z.enum(ALLERGEN_CODES).meta({
  title: 'AllergenCode',
  description: 'One of the 14 EU-regulated allergens (canonical code)',
})

export const nutritionBasisEnum = z.enum(['100g', '100ml']).meta({
  title: 'NutritionBasis',
  description: 'Reference quantity the nutritional values are given for',
})

/** Per 100 g / 100 ml — grams are bounded by the reference quantity itself. */
const gramsPer100 = z.number().min(0).max(100)

export const nutritionalValuesSchema = z.object({
  basis: nutritionBasisEnum.default('100g'),
  energyKcal: z.number().min(0).max(900).optional(),
  fat: gramsPer100.optional(),
  saturatedFat: gramsPer100.optional(),
  carbohydrates: gramsPer100.optional(),
  sugars: gramsPer100.optional(),
  fiber: gramsPer100.optional(),
  protein: gramsPer100.optional(),
  salt: gramsPer100.optional(),
}).superRefine((values, ctx) => {
  if (values.saturatedFat !== undefined && values.fat !== undefined && values.saturatedFat > values.fat) {
    ctx.addIssue({ code: 'custom', path: ['saturatedFat'], message: 'Les acides gras saturés ne peuvent pas dépasser les matières grasses' })
  }
  if (values.sugars !== undefined && values.carbohydrates !== undefined && values.sugars > values.carbohydrates) {
    ctx.addIssue({ code: 'custom', path: ['sugars'], message: 'Les sucres ne peuvent pas dépasser les glucides' })
  }
}).meta({
  title: 'NutritionalValues',
  description: 'Valeurs nutritionnelles pour 100 g / 100 ml',
})

export const createProductSchema = z.object({
  name: z.string().min(2).max(200),
  categoryId: z.string().uuid(),
  description: z.string().max(2000).optional(),
  pricePerUnit: z.number().min(0),
  unit: productUnitCode,
  stock: z.number().int().min(0).default(0),
  stockAlertThreshold: z.number().int().min(0).default(5),
  status: productStatusEnum.default('ACTIVE'),
  variants: z.array(variantInputSchema).optional(),
  mediaIds: z.array(z.string().uuid()).optional(),
  // Composition / fiche produit
  ingredients: z.string().max(4000).optional(),
  allergens: z.array(allergenCodeEnum).max(ALLERGEN_CODES.length).optional(),
  // Codes of the back-office catalogue (`certifications`), checked by the service.
  labels: z.array(certificationCodeSchema).max(20).optional(),
  origin: z.string().max(200).optional(),
  conservation: z.string().max(1000).optional(),
  nutritionalValues: nutritionalValuesSchema.optional(),
}).meta({
  title: 'CreateProduct',
  description: 'Data required to create a new product',
})

export const updateProductSchema = createProductSchema.partial().extend({
  /**
   * URLs of EXISTING photos to keep, in display order. Without it, an edit
   * sending only new mediaIds silently wiped the product's other photos.
   */
  photos: z.array(z.string()).max(10).optional(),
}).meta({
  title: 'UpdateProduct',
  description: 'Update product — all fields optional',
})

export const stockUpdateSchema = z.object({
  stock: z.number().int().min(0),
}).meta({
  title: 'StockUpdate',
  description: 'Update product stock level',
})

export const promotionTypeEnum = z.enum(['PRICE', 'BOGO', 'FREE_DELIVERY']).meta({
  title: 'PromotionType',
  description: 'PRICE = promo unit price, BOGO = buy X get Y free, FREE_DELIVERY = delivery offered on orders holding the product',
})

export const createProductPromotionSchema = z.object({
  type: promotionTypeEnum,
  /** PRICE: the promo unit price, below the regular price. */
  promoPrice: z.number().min(0).optional(),
  /** BOGO: units to buy and units offered (1/1 = "1 acheté 1 offert"). */
  buyQty: z.number().int().min(1).max(20).optional(),
  getQty: z.number().int().min(1).max(20).optional(),
  startsAt: z.string().datetime().optional(),
  /** Omitted = until removed. */
  endsAt: z.string().datetime().nullable().optional(),
}).refine(p => p.type !== 'PRICE' || p.promoPrice !== undefined, { message: 'Le prix promotionnel est requis', path: ['promoPrice'] }).refine(p => p.type !== 'BOGO' || (p.buyQty !== undefined && p.getQty !== undefined), { message: 'Quantités achetée et offerte requises', path: ['buyQty'] }).meta({
  title: 'CreateProductPromotion',
  description: 'A dated promotion on one product',
})

export const productPromotionResponseSchema = z.object({
  id: z.string().uuid(),
  type: promotionTypeEnum,
  promoPrice: z.number().nullable(),
  buyQty: z.number().nullable(),
  getQty: z.number().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  /** SUPPLIER funds its own promotion; PLATFORM = eBio pays the shop back. */
  createdBy: z.enum(['SUPPLIER', 'PLATFORM']),
  isActive: z.boolean(),
}).meta({
  title: 'ProductPromotion',
  description: 'A promotion attached to a product',
})

export type CreateProductPromotion = z.infer<typeof createProductPromotionSchema>
export type ProductPromotionResponse = z.infer<typeof productPromotionResponseSchema>

export const promotionSchema = z.object({
  promotionalPrice: z.number().min(0),
  expiresAt: z.string().datetime(),
}).meta({
  title: 'Promotion',
  description: 'Set a promotional price on a product',
})

const variantResponseSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  /** Price of one unit of this format — of one whole pack for a pack. */
  pricePerUnit: z.number(),
  /** Sellable quantity of this format: whole packs out of the product's stock for a pack. */
  stock: z.number(),
  packSize: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  voiceDescriptionUrl: z.string().nullable(),
  photos: z.array(z.string()),
  /** 320 px thumbnail of the first photo when available (lists, carts). */
  thumbnail: z.string().nullable(),
  pricePerUnit: z.number(),
  unit: productUnitCode,
  stock: z.number(),
  stockAlertThreshold: z.number(),
  status: productStatusEnum,
  moderationStatus: productModerationEnum,
  /** Why eBio refused or withdrew it; null otherwise. */
  moderationReason: z.string().nullable(),
  /** Weighted average of the product's reviews, null below three of them. */
  ratingAvg: z.number().nullable(),
  /** Visible reviews. Shown even while the average stays hidden. */
  ratingCount: z.number(),
  promotionalPrice: z.number().nullable(),
  promotionExpiresAt: z.string().datetime().nullable(),
  /** Promotions live right now (price, buy-X-get-Y, free delivery). */
  promotions: z.array(productPromotionResponseSchema),
  ingredients: z.string().nullable(),
  allergens: z.array(z.string()),
  labels: z.array(z.string()),
  origin: z.string().nullable(),
  conservation: z.string().nullable(),
  nutritionalValues: nutritionalValuesSchema.nullable(),
  variants: z.array(variantResponseSchema),
  /** Owner only: the export request, null when never asked. */
  exportProfile: productExportProfileSchema.nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'ProductResponse',
  description: 'Full product with variants',
})

export const productSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  photo: z.string().nullable(),
  thumbnail: z.string().nullable(),
  pricePerUnit: z.number(),
  unit: productUnitCode,
  stock: z.number(),
  status: productStatusEnum,
  moderationStatus: productModerationEnum,
  moderationReason: z.string().nullable(),
  /** Weighted average of the product's reviews, null below three of them. */
  ratingAvg: z.number().nullable(),
  /** Visible reviews. Shown even while the average stays hidden. */
  ratingCount: z.number(),
  promotionalPrice: z.number().nullable(),
  /** Live promotion types, for badges (e.g. ['BOGO', 'FREE_DELIVERY']). */
  promotionTypes: z.array(promotionTypeEnum),
  /** Owner's list only: export status, null when never asked (011). */
  exportStatus: exportProfileStatusEnum.nullable().optional(),
}).meta({
  title: 'ProductSummary',
  description: 'Minimal product info for lists',
})

// Pagination & filtering for product lists
export const productPaginationSchema = createPaginationQuerySchema()
export type ProductPagination = z.infer<typeof productPaginationSchema>

export const enabledProductFilteringKeys = ['status', 'categoryId'] as const
export const productFilteringSchema = createFilterQueryStringSchema(enabledProductFilteringKeys)
export type ProductFiltering = z.infer<typeof productFilteringSchema>

export const productListSchema = paginatedSchema(productSummarySchema).meta({
  title: 'ProductList',
  description: 'Paginated list of product summaries',
})

export type CreateProduct = z.infer<typeof createProductSchema>
export type UpdateProduct = z.infer<typeof updateProductSchema>
export type StockUpdate = z.infer<typeof stockUpdateSchema>
export type Promotion = z.infer<typeof promotionSchema>
export type ProductResponse = z.infer<typeof productResponseSchema>
export type ProductSummary = z.infer<typeof productSummarySchema>
export type ProductList = z.infer<typeof productListSchema>
