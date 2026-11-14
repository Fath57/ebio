import { z } from 'zod'
import { foreignCurrencyEnum } from '../../currency/contracts/currency.contract'

// ===== ENUMS =====

/** eBio's answer on a product a shop asked to export. */
export enum ExportProfileStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum ExportPackStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  /** Withdrawn by its author; kept for the orders that quote it. */
  RETIRED = 'RETIRED',
}

export enum ExportDepartureStatus {
  OPEN = 'OPEN',
  /** Capacity reached, or closed by hand: no longer offered. */
  FULL = 'FULL',
  CANCELLED = 'CANCELLED',
  DEPARTED = 'DEPARTED',
}

export enum ExportReception {
  PICKUP = 'PICKUP',
  HOME = 'HOME',
}

/**
 * Where a parcel stands; also the standard steps of its timeline. A parcel
 * only counts against a departure's capacity once paid.
 */
export enum ExportShipmentStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  COLLECTING = 'COLLECTING',
  PACKED = 'PACKED',
  DROPPED_AT_AGENCY = 'DROPPED_AT_AGENCY',
  DEPARTED = 'DEPARTED',
  ARRIVED = 'ARRIVED',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  HANDED_OVER = 'HANDED_OVER',
  LOST = 'LOST',
  DAMAGED = 'DAMAGED',
  CANCELLED = 'CANCELLED',
}

export enum ExportSupplementStatus {
  NONE = 'NONE',
  REQUESTED = 'REQUESTED',
  PAID = 'PAID',
  WAIVED = 'WAIVED',
  ITEM_REMOVED = 'ITEM_REMOVED',
}

/** The export checklist (data-model §7): every key must be ticked to approve. */
export const EXPORT_CHECKLIST_KEYS = [
  'label_french',
  'allergens_declared',
  'dates_present',
  'shelf_life_sufficient',
  'ingredients_allowed',
  'label_photo',
] as const

export type ExportChecklistKey = typeof EXPORT_CHECKLIST_KEYS[number]
export type ExportChecklist = Partial<Record<ExportChecklistKey, boolean>>

/**
 * A destination country, ISO 3166-1 alpha-2. The list is data
 * (`export_countries`, edited in the back office): services check the code
 * exists, and is active for anything new a buyer starts.
 */
export const exportCountryCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Code pays ISO à deux lettres attendu (FR, BE, CA…)').meta({
  title: 'ExportCountryCode',
  description: 'Code ISO à deux lettres du pays de destination d\'une valise',
})

export const exportProfileStatusEnum = z.enum(ExportProfileStatus).meta({
  title: 'ExportProfileStatus',
  description: 'Validation d\'un produit pour l\'export : en attente, validé, refusé',
})

export const exportPackStatusEnum = z.enum(ExportPackStatus).meta({
  title: 'ExportPackStatus',
  description: 'Validation d\'un pack du pays',
})

export const exportDepartureStatusEnum = z.enum(ExportDepartureStatus).meta({
  title: 'ExportDepartureStatus',
  description: 'Statut d\'un départ : ouvert, complet, annulé, parti',
})

export const exportShipmentStatusEnum = z.enum(ExportShipmentStatus).meta({
  title: 'ExportShipmentStatus',
  description: 'Étape d\'une valise',
})

export const exportSupplementStatusEnum = z.enum(ExportSupplementStatus).meta({
  title: 'ExportSupplementStatus',
  description: 'Complément de poids : aucun, demandé, payé, pris en charge par eBio, produit retiré',
})

export const exportReviewDecisionEnum = z.enum(['APPROVE', 'REJECT']).meta({
  title: 'ExportReviewDecision',
  description: 'Décision d\'eBio sur un produit ou un pack',
})

const amount = z.number().positive().max(10_000_000)
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')

// ===== §5 BACK-OFFICE, AGENCIES =====

export const exportAgencyInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactName: optionalText(120),
  contactPhone: optionalText(30),
  contactEmail: z.string().trim().email().max(200).nullable().optional(),
  notes: optionalText(2000),
  active: z.boolean().optional(),
}).meta({
  title: 'ExportAgencyInput',
  description: 'Agence partenaire : nom, contact, notes',
})

export type ExportAgencyInput = z.infer<typeof exportAgencyInputSchema>

export const updateExportAgencySchema = exportAgencyInputSchema.partial().meta({
  title: 'UpdateExportAgency',
  description: 'Champs d\'une agence partenaire à modifier',
})

export type UpdateExportAgency = z.infer<typeof updateExportAgencySchema>

export const exportPickupPointInputSchema = z.object({
  country: exportCountryCodeSchema,
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(500),
  openingHours: optionalText(300),
  active: z.boolean().optional(),
}).meta({
  title: 'ExportPickupPointInput',
  description: 'Point de retrait d\'une agence : pays, ville, adresse, horaires',
})

export type ExportPickupPointInput = z.infer<typeof exportPickupPointInputSchema>

export const updateExportPickupPointSchema = exportPickupPointInputSchema.partial().meta({
  title: 'UpdateExportPickupPoint',
  description: 'Champs d\'un point de retrait à modifier',
})

export type UpdateExportPickupPoint = z.infer<typeof updateExportPickupPointSchema>

export const exportPickupPointResponseSchema = z.object({
  id: z.string().uuid(),
  agencyId: z.string().uuid(),
  country: exportCountryCodeSchema,
  city: z.string(),
  address: z.string(),
  openingHours: z.string().nullable(),
  active: z.boolean(),
}).meta({
  title: 'ExportPickupPoint',
  description: 'Point de retrait d\'une agence partenaire',
})

export const exportAgencyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  pickupPoints: z.array(exportPickupPointResponseSchema),
  createdAt: z.string().datetime(),
}).meta({
  title: 'ExportAgency',
  description: 'Agence partenaire et ses points de retrait',
})

export type ExportAgencyResponse = z.infer<typeof exportAgencyResponseSchema>
export type ExportPickupPointResponse = z.infer<typeof exportPickupPointResponseSchema>

// ===== §5 BACK-OFFICE, DEPARTURES =====

export const exportDepartureRateInputSchema = z.object({
  country: exportCountryCodeSchema,
  /** FCFA per kilo, duties and taxes included (FR-014). */
  pricePerKg: amount,
  minBilledKg: z.number().min(0).max(1_000),
  maxWeightKg: z.number().positive().max(1_000).nullable().optional(),
  /** Null: the agency does not deliver to the door in this country. */
  homeDeliveryFee: z.number().min(0).max(10_000_000).nullable().optional(),
}).meta({
  title: 'ExportDepartureRateInput',
  description: 'Tarif d\'un départ pour un pays',
})

export type ExportDepartureRateInput = z.infer<typeof exportDepartureRateInputSchema>

const departureFields = {
  agencyId: z.string().uuid(),
  departsOn: isoDay,
  depositDeadline: z.string().datetime({ offset: true }),
  transitMinDays: z.number().int().min(0).max(120),
  transitMaxDays: z.number().int().min(0).max(120),
  capacityKg: z.number().positive().max(100_000).nullable().optional(),
  rates: z.array(exportDepartureRateInputSchema).min(1, 'Indiquez au moins un tarif').max(2),
}

export const createExportDepartureSchema = z.object(departureFields).meta({
  title: 'CreateExportDeparture',
  description: 'Nouveau départ : agence, dates, délai annoncé, capacité, tarifs par pays',
})

export type CreateExportDeparture = z.infer<typeof createExportDepartureSchema>

export const updateExportDepartureSchema = z.object({
  ...departureFields,
  /** Closing by hand (FULL), reopening (OPEN) or marking it gone (DEPARTED); cancelling has its own route. */
  status: z.enum([ExportDepartureStatus.OPEN, ExportDepartureStatus.FULL, ExportDepartureStatus.DEPARTED]),
}).partial().meta({
  title: 'UpdateExportDeparture',
  description: 'Champs d\'un départ à modifier ; les tarifs envoyés remplacent les précédents',
})

export type UpdateExportDeparture = z.infer<typeof updateExportDepartureSchema>

export const cancelExportDepartureSchema = z.object({
  /** Another open departure to move the parcels to; without it they wait on this one. */
  reassignTo: z.string().uuid().nullable().optional(),
}).meta({
  title: 'CancelExportDeparture',
  description: 'Annulation d\'un départ, avec réaffectation facultative des colis',
})

export type CancelExportDeparture = z.infer<typeof cancelExportDepartureSchema>

export const exportDeparturesQuerySchema = z.object({
  status: exportDepartureStatusEnum.optional(),
}).meta({
  title: 'ExportDeparturesQuery',
  description: 'Filtre de la liste des départs',
})

export type ExportDeparturesQuery = z.infer<typeof exportDeparturesQuerySchema>

export const exportDepartureRateResponseSchema = z.object({
  country: exportCountryCodeSchema,
  pricePerKg: z.number(),
  minBilledKg: z.number(),
  maxWeightKg: z.number().nullable(),
  homeDeliveryFee: z.number().nullable(),
}).meta({
  title: 'ExportDepartureRate',
  description: 'Tarif d\'un départ pour un pays',
})

export const exportFillSchema = z.object({
  reservedKg: z.number(),
  /** Null: no negotiated capacity. */
  capacityKg: z.number().nullable(),
  ratio: z.number().nullable(),
}).meta({
  title: 'ExportDepartureFill',
  description: 'Kilos réservés par rapport à la capacité négociée',
})

export const exportDepartureResponseSchema = z.object({
  id: z.string().uuid(),
  agency: z.object({ id: z.string().uuid(), name: z.string() }),
  departsOn: z.string(),
  depositDeadline: z.string().datetime(),
  /** Last moment a buyer may order for this departure (deadline minus the collection days). */
  orderBefore: z.string().datetime(),
  transitMinDays: z.number(),
  transitMaxDays: z.number(),
  arrival: z.object({ from: z.string(), to: z.string() }),
  status: exportDepartureStatusEnum,
  rates: z.array(exportDepartureRateResponseSchema),
  fill: exportFillSchema,
  shipmentCount: z.number(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'ExportDeparture',
  description: 'Départ d\'une agence partenaire',
})

export type ExportDepartureResponse = z.infer<typeof exportDepartureResponseSchema>

export const exportDepartureDetailSchema = exportDepartureResponseSchema.extend({
  shipments: z.array(z.object({
    id: z.string().uuid(),
    buyer: z.string(),
    country: exportCountryCodeSchema,
    status: exportShipmentStatusEnum,
    estimatedWeightG: z.number(),
    actualWeightG: z.number().nullable(),
    insured: z.boolean(),
  })),
  collection: z.array(z.object({
    supplierId: z.string().uuid(),
    shopName: z.string(),
    lines: z.array(z.object({
      shipmentId: z.string().uuid(),
      orderId: z.string().uuid(),
      /** For POST /admin/export/shipments/:id/missing. */
      orderItemId: z.string().uuid(),
      /** Tells apart two lines of the same product in different parcels. */
      orderNumber: z.string(),
      name: z.string(),
      quantity: z.number(),
      /** A product is never shown without its picture. */
      imageUrl: z.string().nullable(),
    })),
    collected: z.boolean(),
  })),
}).meta({
  title: 'ExportDepartureDetail',
  description: 'Départ : remplissage, colis et liste de collecte par boutique',
})

export type ExportDepartureDetail = z.infer<typeof exportDepartureDetailSchema>

export const cancelExportDepartureResponseSchema = z.object({
  departure: exportDepartureResponseSchema,
  /** Parcels moved to `reassignTo`. */
  reassigned: z.number(),
  /** What eBio pays on top, the new route being dearer (FR-023). */
  surcharge: z.number(),
}).meta({
  title: 'CancelExportDepartureResult',
  description: 'Résultat de l\'annulation d\'un départ',
})

export type CancelExportDepartureResult = z.infer<typeof cancelExportDepartureResponseSchema>

// ===== §4 SHOP, EXPORT PROFILE =====

export const exportOriginSchema = z.object({
  producer: optionalText(120),
  place: optionalText(120),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  method: optionalText(300),
  photos: z.array(z.string().url()).max(3, 'Trois photos d\'origine au plus').default([]),
}).meta({
  title: 'ExportOrigin',
  description: 'Origine du produit : producteur, lieu, année, mode de fabrication, photos',
})

export const exportProfileInputSchema = z.object({
  packedWeightG: z.number().int().positive().max(50_000),
  lengthCm: z.number().int().positive().max(300).nullable().optional(),
  widthCm: z.number().int().positive().max(300).nullable().optional(),
  heightCm: z.number().int().positive().max(300).nullable().optional(),
  shelfLifeDays: z.number().int().positive().max(3_650),
  origin: exportOriginSchema.default({ photos: [] }),
  /** Required before eBio can approve (FR-002). */
  labelPhoto: z.string().url().nullable().optional(),
}).meta({
  title: 'ExportProfileInput',
  description: 'Demande d\'export d\'un produit : poids, dimensions, conservation, origine, étiquette',
})

export type ExportProfileInput = z.infer<typeof exportProfileInputSchema>

export const exportProfileResponseSchema = z.object({
  productId: z.string().uuid(),
  status: exportProfileStatusEnum,
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
  checklist: z.record(z.string(), z.boolean()),
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  /** « Terroir validé eBio »: approved with an origin. */
  badge: z.boolean(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'ExportProfile',
  description: 'Profil d\'export d\'un produit et sa validation',
})

export type ExportProfileResponse = z.infer<typeof exportProfileResponseSchema>

// ===== §4 SHOP / §5 BACK-OFFICE, PACKS =====

export const exportPackItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().positive().max(100),
}).meta({
  title: 'ExportPackItemInput',
  description: 'Produit d\'un pack et sa quantité',
})

export const exportPackInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: optionalText(2000),
  photos: z.array(z.string().url()).max(6).default([]),
  price: amount,
  items: z.array(exportPackItemInputSchema).min(1, 'Un pack contient au moins un produit').max(20),
}).meta({
  title: 'ExportPackInput',
  description: 'Pack du pays : nom, description, photos, prix, produits',
})

export type ExportPackInput = z.infer<typeof exportPackInputSchema>

export const updateExportPackSchema = exportPackInputSchema.partial().meta({
  title: 'UpdateExportPack',
  description: 'Champs d\'un pack à modifier ; les produits envoyés remplacent les précédents',
})

export type UpdateExportPack = z.infer<typeof updateExportPackSchema>

export const exportPackResponseSchema = z.object({
  id: z.string().uuid(),
  /** Null: a pack composed by eBio. */
  supplierId: z.string().uuid().nullable(),
  shopName: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  photos: z.array(z.string()),
  price: z.number(),
  status: exportPackStatusEnum,
  rejectionReason: z.string().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable(),
    quantity: z.number(),
    name: z.string(),
    imageUrl: z.string().nullable(),
    supplierId: z.string().uuid(),
    shopName: z.string(),
    unitPrice: z.number(),
    exportStatus: exportProfileStatusEnum.nullable(),
  })),
  /** Sum of the lines at today's shop prices. */
  linesTotal: z.number(),
  /** Pack price minus the lines: eBio's margin when positive, its compensation when negative. */
  difference: z.number(),
  /** Every product approved, on sale and in stock (FR-006). */
  orderable: z.boolean(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'ExportPack',
  description: 'Pack du pays, boutique ou eBio',
})

export type ExportPackResponse = z.infer<typeof exportPackResponseSchema>

// ===== §5 BACK-OFFICE, REVIEWS =====

export const exportChecklistSchema = z.object(
  Object.fromEntries(EXPORT_CHECKLIST_KEYS.map(key => [key, z.boolean().optional()])) as Record<ExportChecklistKey, z.ZodOptional<z.ZodBoolean>>,
).meta({
  title: 'ExportChecklist',
  description: 'Liste de contrôle d\'export : chaque clé cochée',
})

export const reviewExportProductSchema = z.object({
  decision: exportReviewDecisionEnum,
  checklist: exportChecklistSchema.default({}),
  reason: z.string().trim().max(500).nullable().optional(),
}).meta({
  title: 'ReviewExportProduct',
  description: 'Validation d\'un produit pour l\'export, liste de contrôle cochée, ou refus motivé',
})

export type ReviewExportProduct = z.infer<typeof reviewExportProductSchema>

export const reviewExportPackSchema = z.object({
  decision: exportReviewDecisionEnum,
  reason: z.string().trim().max(500).nullable().optional(),
}).meta({
  title: 'ReviewExportPack',
  description: 'Validation d\'un pack, ou refus motivé',
})

export type ReviewExportPack = z.infer<typeof reviewExportPackSchema>

export const exportReviewsQuerySchema = z.object({
  status: exportProfileStatusEnum.default(ExportProfileStatus.PENDING),
}).meta({
  title: 'ExportReviewsQuery',
  description: 'Filtre de la file de validation',
})

export type ExportReviewsQuery = z.infer<typeof exportReviewsQuerySchema>

export const exportReviewsResponseSchema = z.object({
  products: z.array(exportProfileResponseSchema.extend({
    productName: z.string(),
    imageUrl: z.string().nullable(),
    supplierId: z.string().uuid(),
    shopName: z.string(),
    categoryName: z.string(),
    composition: z.object({
      ingredients: z.string().nullable(),
      allergens: z.array(z.string()),
      conservation: z.string().nullable(),
    }),
  })),
  packs: z.array(exportPackResponseSchema),
}).meta({
  title: 'ExportReviews',
  description: 'Produits et packs à valider pour l\'export',
})

export type ExportReviewsResponse = z.infer<typeof exportReviewsResponseSchema>

// ===== §1 CLIENT, CATALOGUE AND DEPARTURES =====

export const exportReceptionEnum = z.enum(ExportReception).meta({
  title: 'ExportReception',
  description: 'Réception du colis : retrait en agence ou livraison à domicile',
})

export const terroirPaymentMethodEnum = z.enum(['FEDAPAY', 'WALLET']).meta({
  title: 'TerroirPaymentMethod',
  description: 'Paiement d\'une valise : carte (page hébergée) ou portefeuille eBio',
})

export const terroirUnavailableReasonEnum = z.enum(['NOT_FOUND', 'NOT_EXPORTABLE', 'OUT_OF_STOCK', 'PACK_UNAVAILABLE']).meta({
  title: 'TerroirUnavailableReason',
  description: 'Pourquoi une ligne du valise ne peut pas partir',
})

const displayCurrencyField = z.enum(['XOF', 'EUR', 'USD', 'CAD']).default('EUR')

/** Absent: the destination country's own display currency. */
const countryCurrencyField = z.enum(['XOF', 'EUR', 'USD', 'CAD']).optional()

export const terroirCatalogQuerySchema = z.object({
  country: exportCountryCodeSchema,
  category: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  currency: countryCurrencyField,
}).meta({
  title: 'TerroirCatalogQuery',
  description: 'Catalogue de la Valise du pays : pays, catégorie, recherche, page, devise d\'affichage',
})

export type TerroirCatalogQuery = z.infer<typeof terroirCatalogQuerySchema>

export const terroirDisplayQuerySchema = z.object({
  currency: displayCurrencyField,
}).meta({
  title: 'TerroirDisplayQuery',
  description: 'Devise d\'affichage des prix',
})

export type TerroirDisplayQuery = z.infer<typeof terroirDisplayQuerySchema>

const terroirOriginSchema = z.object({
  producer: z.string().nullable(),
  place: z.string().nullable(),
  year: z.number().nullable(),
  method: z.string().nullable(),
  photos: z.array(z.string()),
})

export const terroirCatalogProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  /** FCFA; `displayPrice` in the requested currency, null without a rate. */
  price: z.number(),
  displayPrice: z.number().nullable(),
  weightG: z.number(),
  supplierId: z.string().uuid(),
  shopName: z.string(),
  categoryName: z.string(),
  /** « Terroir validé eBio ». */
  badge: z.boolean(),
  origin: z.object({ producer: z.string().nullable(), place: z.string().nullable() }),
}).meta({
  title: 'TerroirCatalogProduct',
  description: 'Produit exportable dans le catalogue de la Valise du pays',
})

export const terroirCatalogPackSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  price: z.number(),
  displayPrice: z.number().nullable(),
  weightG: z.number(),
  /** Null: composed by eBio. */
  shopName: z.string().nullable(),
  itemCount: z.number(),
}).meta({
  title: 'TerroirCatalogPack',
  description: 'Pack du pays commandable',
})

export const terroirCatalogResponseSchema = z.object({
  country: exportCountryCodeSchema,
  currency: z.string(),
  products: z.array(terroirCatalogProductSchema),
  /** Every orderable pack matching the search, on the first page only. */
  packs: z.array(terroirCatalogPackSchema),
  page: z.number(),
  hasMore: z.boolean(),
}).meta({
  title: 'TerroirCatalog',
  description: 'Catalogue de la Valise du pays : produits exportables et packs',
})

export type TerroirCatalogResponse = z.infer<typeof terroirCatalogResponseSchema>

export const terroirProductDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  photos: z.array(z.string()),
  price: z.number(),
  displayPrice: z.number().nullable(),
  currency: z.string(),
  weightG: z.number(),
  dimensionsCm: z.object({ length: z.number().nullable(), width: z.number().nullable(), height: z.number().nullable() }),
  shelfLifeDays: z.number(),
  composition: z.object({
    ingredients: z.string().nullable(),
    allergens: z.array(z.string()),
    conservation: z.string().nullable(),
  }),
  origin: terroirOriginSchema,
  badge: z.boolean(),
  supplierId: z.string().uuid(),
  shopName: z.string(),
  inStock: z.boolean(),
  variants: z.array(z.object({
    id: z.string().uuid(),
    label: z.string(),
    price: z.number(),
    displayPrice: z.number().nullable(),
    weightG: z.number(),
    inStock: z.boolean(),
  })),
}).meta({
  title: 'TerroirProductDetail',
  description: 'Fiche d\'un produit exportable : prix, poids, composition, origine',
})

export type TerroirProductDetail = z.infer<typeof terroirProductDetailSchema>

export const terroirPackDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  photos: z.array(z.string()),
  price: z.number(),
  displayPrice: z.number().nullable(),
  currency: z.string(),
  weightG: z.number(),
  shopName: z.string().nullable(),
  orderable: z.boolean(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().nullable(),
    name: z.string(),
    quantity: z.number(),
    imageUrl: z.string().nullable(),
    shopName: z.string(),
    badge: z.boolean(),
    origin: z.object({ producer: z.string().nullable(), place: z.string().nullable() }),
  })),
}).meta({
  title: 'TerroirPackDetail',
  description: 'Fiche d\'un pack du pays et de ses produits',
})

export type TerroirPackDetail = z.infer<typeof terroirPackDetailSchema>

export const terroirDeparturesQuerySchema = z.object({
  country: exportCountryCodeSchema,
  weightG: z.coerce.number().int().min(0).max(1_000_000).default(0),
  currency: countryCurrencyField,
}).meta({
  title: 'TerroirDeparturesQuery',
  description: 'Départs proposables vers un pays, pour un poids de colis',
})

export type TerroirDeparturesQuery = z.infer<typeof terroirDeparturesQuerySchema>

export const terroirDepartureOfferSchema = z.object({
  departureId: z.string().uuid(),
  agency: z.string(),
  departsOn: z.string(),
  arrival: z.object({ from: z.string(), to: z.string() }),
  pricePerKg: z.number(),
  minBilledKg: z.number(),
  maxWeightKg: z.number().nullable(),
  /** Null: no door delivery towards this country on this departure. */
  homeDeliveryFee: z.number().nullable(),
  shippingPrice: z.number(),
  display: z.object({ currency: z.string(), shippingPrice: z.number(), homeDeliveryFee: z.number().nullable() }).nullable(),
  /** Last moment to order. */
  orderBefore: z.string().datetime(),
  /** When eBio must have collected the products from the shops: the agency's deposit deadline. */
  collectBefore: z.string().datetime(),
  /** Duties and taxes are included in the price per kilo (FR-014). */
  dutiesIncluded: z.boolean(),
  pickupPoints: z.array(z.object({ id: z.string().uuid(), city: z.string(), address: z.string(), openingHours: z.string().nullable() })),
}).meta({
  title: 'TerroirDepartureOffer',
  description: 'Départ proposable : agence, dates, arrivée estimée, prix du transport',
})

export const terroirDeparturesResponseSchema = z.object({
  next: z.object({
    departureId: z.string().uuid(),
    agency: z.string(),
    city: z.string().nullable(),
    departsOn: z.string(),
    orderBefore: z.string().datetime(),
  }).nullable(),
  items: z.array(terroirDepartureOfferSchema),
  /** Signed in: a pending « me prévenir » alert exists for this country; false when signed out. */
  alertSubscribed: z.boolean(),
}).meta({
  title: 'TerroirDepartures',
  description: 'Prochain départ et liste des départs proposables',
})

export type TerroirDeparturesResponse = z.infer<typeof terroirDeparturesResponseSchema>
export type TerroirDepartureOffer = z.infer<typeof terroirDepartureOfferSchema>

// ===== §2 CLIENT, CHECKOUT =====

export const terroirCartLineSchema = z.object({
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().nullable().optional(),
  packId: z.string().uuid().optional(),
  quantity: z.number().int().positive().max(50),
}).refine(line => Boolean(line.productId) !== Boolean(line.packId), {
  message: 'Chaque ligne est un produit ou un pack',
}).meta({
  title: 'TerroirCartLine',
  description: 'Ligne du valise : un produit (et sa variante) ou un pack',
})

export const terroirGiftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: z.string().trim().regex(/^\+\d{8,15}$/, 'Numéro au format international (+33…)').nullable().optional(),
  message: z.string().trim().max(300).nullable().optional(),
}).refine(gift => Boolean(gift.email || gift.phone), {
  message: 'Indiquez l\'e-mail ou le téléphone du destinataire',
}).meta({
  title: 'TerroirGift',
  description: 'Destinataire d\'un colis offert : nom, e-mail, téléphone, message',
})

export const terroirCheckoutInputSchema = z.object({
  /** The destination, the recipient's country for a gift. */
  country: exportCountryCodeSchema,
  lines: z.array(terroirCartLineSchema).min(1, 'Votre valise est vide').max(40),
  /** Preview: the soonest offered departure when absent. */
  departureId: z.string().uuid().nullable().optional(),
  reception: exportReceptionEnum.default(ExportReception.PICKUP),
  /** PICKUP: the agency's first point in the country when absent. */
  pickupPointId: z.string().uuid().nullable().optional(),
  homeAddress: z.string().trim().min(10).max(500).nullable().optional(),
  insured: z.boolean().default(false),
  gift: terroirGiftSchema.nullable().optional(),
  paymentMethod: terroirPaymentMethodEnum.default('FEDAPAY'),
  displayCurrency: countryCurrencyField,
}).meta({
  title: 'TerroirCheckoutInput',
  description: 'Valise : pays, lignes, départ, réception, assurance, cadeau, paiement',
})

export type TerroirCheckoutInput = z.infer<typeof terroirCheckoutInputSchema>

const amountsDisplaySchema = z.object({
  currency: z.string(),
  total: z.number(),
  itemsTotal: z.number(),
  shippingPrice: z.number(),
  homeDeliveryFee: z.number(),
  insurancePrice: z.number(),
}).nullable()

export const terroirCheckoutPreviewSchema = z.object({
  country: exportCountryCodeSchema,
  lines: z.array(z.object({
    productId: z.string().uuid().nullable(),
    variantId: z.string().uuid().nullable(),
    packId: z.string().uuid().nullable(),
    name: z.string(),
    imageUrl: z.string().nullable(),
    quantity: z.number(),
    unitPrice: z.number(),
    total: z.number(),
    weightG: z.number(),
    shopName: z.string().nullable(),
  })),
  estimatedWeightG: z.number(),
  /** Kilos billed on the selected departure; null without one. */
  billedKg: z.number().nullable(),
  /** Kilos that still fit under the minimum billed at no extra cost (US8). */
  marginKg: z.number(),
  suggestions: z.array(z.object({
    productId: z.string().uuid(),
    name: z.string(),
    weightG: z.number(),
    price: z.number(),
    imageUrl: z.string().nullable(),
    shopName: z.string(),
  })),
  /** The departure the amounts are for: the one asked if still offered, else the soonest. */
  departureId: z.string().uuid().nullable(),
  itemsTotal: z.number(),
  shippingPrice: z.number(),
  homeDeliveryFee: z.number(),
  insurancePrice: z.number(),
  total: z.number(),
  /** What the options would cost: null home fee = no door delivery on this departure. */
  options: z.object({
    homeDeliveryFee: z.number().nullable(),
    insurancePrice: z.number(),
  }),
  display: amountsDisplaySchema,
  departures: z.array(terroirDepartureOfferSchema),
  unavailable: z.array(z.object({
    productId: z.string().uuid().nullable(),
    packId: z.string().uuid().nullable(),
    reason: terroirUnavailableReasonEnum,
  })),
}).meta({
  title: 'TerroirCheckoutPreview',
  description: 'Aperçu du passage en caisse de la Valise du pays : poids, départs, transport, options, total',
})

export type TerroirCheckoutPreview = z.infer<typeof terroirCheckoutPreviewSchema>

export const terroirCheckoutResultSchema = z.object({
  checkoutId: z.string().uuid(),
  shipmentId: z.string().uuid(),
  total: z.number(),
  /** PAID right away from the wallet; PENDING_PAYMENT until the card payment is confirmed. */
  status: exportShipmentStatusEnum,
  /** Always null: a card checkout is opened by POST /payments/cart/initiate { checkoutId }, then verified by /payments/cart/verify. */
  paymentUrl: z.string().nullable(),
  display: z.object({ currency: z.string(), total: z.number() }).nullable(),
}).meta({
  title: 'TerroirCheckoutResult',
  description: 'Passage en caisse de la Valise du pays créé : colis, total, lien de paiement',
})

export type TerroirCheckoutResult = z.infer<typeof terroirCheckoutResultSchema>

// ===== §3 CLIENT, PARCELS =====

const shipmentDepartureSchema = z.object({
  agency: z.string(),
  departsOn: z.string(),
  arrival: z.object({ from: z.string(), to: z.string() }),
})

const shipmentEventSchema = z.object({
  step: exportShipmentStatusEnum.nullable(),
  message: z.string().nullable(),
  /** Address and hours as shown when the step was published. */
  pickupPoint: z.string().nullable(),
  at: z.string().datetime(),
})

const shipmentLineSchema = z.object({
  /** The order line: `lineId` of a REMOVE_ITEM supplement choice. */
  id: z.string().uuid(),
  name: z.string(),
  quantity: z.number(),
  imageUrl: z.string().nullable(),
  shopName: z.string(),
})

export const terroirShipmentSummarySchema = z.object({
  id: z.string().uuid(),
  status: exportShipmentStatusEnum,
  country: exportCountryCodeSchema,
  departure: shipmentDepartureSchema,
  reception: exportReceptionEnum,
  itemCount: z.number(),
  imageUrl: z.string().nullable(),
  total: z.number(),
  gift: z.object({ name: z.string() }).nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'TerroirShipmentSummary',
  description: 'Valise dans la liste du client',
})

export const terroirShipmentDetailSchema = z.object({
  id: z.string().uuid(),
  status: exportShipmentStatusEnum,
  country: exportCountryCodeSchema,
  departure: shipmentDepartureSchema.extend({ collectBefore: z.string().datetime() }),
  reception: exportReceptionEnum,
  pickupPoint: z.object({ city: z.string(), address: z.string(), openingHours: z.string().nullable() }).nullable(),
  homeAddress: z.string().nullable(),
  lines: z.array(shipmentLineSchema),
  events: z.array(shipmentEventSchema),
  /** A weight supplement asked of the buyer; null when the parcel weighed what was paid for. */
  supplement: z.object({
    amount: z.number(),
    status: exportSupplementStatusEnum,
    requestedAt: z.string().datetime().nullable(),
    /** Without an answer by then, eBio absorbs the gap (REQUESTED only). */
    deadline: z.string().datetime().nullable(),
  }).nullable(),
  estimatedWeightG: z.number(),
  actualWeightG: z.number().nullable(),
  itemsTotal: z.number(),
  shippingPrice: z.number(),
  homeDeliveryFee: z.number(),
  insurancePrice: z.number(),
  total: z.number(),
  /** Frozen at checkout. */
  display: z.object({ currency: z.string(), total: z.number() }).nullable(),
  insured: z.boolean(),
  gift: z.object({ name: z.string(), email: z.string().nullable(), phone: z.string().nullable(), message: z.string().nullable() }).nullable(),
  /** Public page of a gifted parcel, without prices. */
  trackingToken: z.string(),
  checkoutId: z.string().uuid(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'TerroirShipmentDetail',
  description: 'Valise : étape, départ, retrait, contenu, historique, montants',
})

export type TerroirShipmentSummary = z.infer<typeof terroirShipmentSummarySchema>
export type TerroirShipmentDetail = z.infer<typeof terroirShipmentDetailSchema>

/** Public tracking of a gifted parcel (US10): never a price nor an amount. */
export const terroirTrackingSchema = z.object({
  status: exportShipmentStatusEnum,
  country: exportCountryCodeSchema,
  recipientName: z.string().nullable(),
  senderName: z.string(),
  giftMessage: z.string().nullable(),
  departure: shipmentDepartureSchema,
  reception: exportReceptionEnum,
  pickupPoint: z.object({ city: z.string(), address: z.string(), openingHours: z.string().nullable() }).nullable(),
  lines: z.array(z.object({ name: z.string(), quantity: z.number(), imageUrl: z.string().nullable() })),
  events: z.array(shipmentEventSchema),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'TerroirTracking',
  description: 'Suivi public d\'un colis offert, sans aucun prix',
})

export type TerroirTracking = z.infer<typeof terroirTrackingSchema>

// ===== §1 CLIENT, DEPARTURE ALERTS =====

export const terroirDepartureAlertInputSchema = z.object({
  country: exportCountryCodeSchema,
}).meta({
  title: 'TerroirDepartureAlertInput',
  description: '« Me prévenir du prochain départ » vers un pays',
})

export type TerroirDepartureAlertInput = z.infer<typeof terroirDepartureAlertInputSchema>

export const terroirDepartureAlertResponseSchema = z.object({
  country: exportCountryCodeSchema,
  /** A pending alert exists after the call. */
  subscribed: z.boolean(),
}).meta({
  title: 'TerroirDepartureAlert',
  description: 'Alerte de prochain départ d\'un client',
})

export type TerroirDepartureAlertResponse = z.infer<typeof terroirDepartureAlertResponseSchema>

// ===== §3 CLIENT, WEIGHT SUPPLEMENT =====

export const terroirSupplementChoiceEnum = z.enum(['PAY', 'REMOVE_ITEM']).meta({
  title: 'TerroirSupplementChoice',
  description: 'Réponse au complément de poids : payer, ou retirer un produit (remboursé)',
})

export const terroirSupplementInputSchema = z.object({
  choice: terroirSupplementChoiceEnum,
  /** REMOVE_ITEM: the `id` of a line of the parcel. */
  lineId: z.string().uuid().nullable().optional(),
  /** PAY: card (INTRAM page, through a wallet top-up) or the eBio wallet. */
  paymentMethod: terroirPaymentMethodEnum.default('FEDAPAY'),
}).refine(input => input.choice !== 'REMOVE_ITEM' || Boolean(input.lineId), {
  message: 'Choisissez le produit à retirer',
  path: ['lineId'],
}).meta({
  title: 'TerroirSupplementInput',
  description: 'Choix du client face au complément de poids',
})

export type TerroirSupplementInput = z.infer<typeof terroirSupplementInputSchema>

export const terroirSupplementResultSchema = z.object({
  supplementStatus: exportSupplementStatusEnum,
  /** What is still asked (REQUESTED), or what was paid; null once nothing is due. */
  amount: z.number().nullable(),
  /**
   * PAY by card: the wallet top-up opened for the amount. The app opens
   * `paymentUrl` (INTRAM hosted page), or the widget when null, then calls
   * POST /wallet/me/topups/:topupId/verify; once credited, the supplement is
   * debited from the wallet and the parcel goes on. Null otherwise.
   */
  topupId: z.string().uuid().nullable(),
  paymentUrl: z.string().nullable(),
  providerTransactionId: z.string().nullable(),
}).meta({
  title: 'TerroirSupplementResult',
  description: 'Complément de poids après le choix du client',
})

export type TerroirSupplementResult = z.infer<typeof terroirSupplementResultSchema>

// ===== §5 BACK-OFFICE, PARCELS =====

export const collectExportShipmentSchema = z.object({
  supplierId: z.string().uuid(),
}).meta({ title: 'CollectExportShipment', description: 'Collecte des produits d\'une boutique pour un colis' })

export type CollectExportShipment = z.infer<typeof collectExportShipmentSchema>

export const missingExportItemSchema = z.object({
  orderItemId: z.string().uuid(),
}).meta({ title: 'MissingExportItem', description: 'Produit manquant à la collecte : retiré du colis et remboursé' })

export type MissingExportItem = z.infer<typeof missingExportItemSchema>

export const weighExportShipmentSchema = z.object({
  actualWeightG: z.number().int().positive().max(200_000),
}).meta({ title: 'WeighExportShipment', description: 'Poids réel du colis, en grammes' })

export type WeighExportShipment = z.infer<typeof weighExportShipmentSchema>

export const exportShipmentEventInputSchema = z.object({
  step: exportShipmentStatusEnum.nullable().optional(),
  message: z.string().trim().min(1).max(1000).nullable().optional(),
  /** Address and hours shown with the step; READY_FOR_PICKUP defaults to the parcel's pickup point. */
  pickupPoint: z.string().trim().min(1).max(500).nullable().optional(),
}).refine(input => Boolean(input.step || input.message), {
  message: 'Indiquez une étape ou un message',
}).meta({ title: 'ExportShipmentEventInput', description: 'Étape et / ou message libre sur un colis' })

export type ExportShipmentEventInput = z.infer<typeof exportShipmentEventInputSchema>

export const exportDepartureEventInputSchema = z.object({
  step: exportShipmentStatusEnum,
  message: z.string().trim().min(1).max(1000).nullable().optional(),
}).meta({ title: 'ExportDepartureEventInput', description: 'Étape appliquée à tous les colis d\'un départ' })

export type ExportDepartureEventInput = z.infer<typeof exportDepartureEventInputSchema>

export const exportDepartureEventResultSchema = z.object({
  /** Parcels the step was applied to (settled ones and the wrong reception mode left out). */
  applied: z.number(),
}).meta({ title: 'ExportDepartureEventResult', description: 'Nombre de colis mis à jour' })

export type ExportDepartureEventResult = z.infer<typeof exportDepartureEventResultSchema>

export const lostExportShipmentSchema = z.object({
  damaged: z.boolean(),
}).meta({ title: 'LostExportShipment', description: 'Colis perdu (false) ou abîmé (true) : remboursé sans retour' })

export type LostExportShipment = z.infer<typeof lostExportShipmentSchema>

export const exportAdminShipmentSchema = z.object({
  id: z.string().uuid(),
  status: exportShipmentStatusEnum,
  country: exportCountryCodeSchema,
  buyer: z.object({ id: z.string().uuid(), name: z.string(), email: z.string().nullable(), phone: z.string().nullable() }),
  gift: z.object({ name: z.string(), email: z.string().nullable(), phone: z.string().nullable(), message: z.string().nullable() }).nullable(),
  departure: z.object({ id: z.string().uuid(), agency: z.string(), departsOn: z.string(), status: exportDepartureStatusEnum, depositDeadline: z.string().datetime() }),
  reception: exportReceptionEnum,
  pickupPoint: z.object({ id: z.string().uuid(), city: z.string(), address: z.string(), openingHours: z.string().nullable() }).nullable(),
  homeAddress: z.string().nullable(),
  estimatedWeightG: z.number(),
  actualWeightG: z.number().nullable(),
  shippingPrice: z.number(),
  homeDeliveryFee: z.number(),
  insured: z.boolean(),
  insurancePrice: z.number(),
  /** Value of the products still in the parcel. */
  declaredValue: z.number(),
  supplement: z.object({
    status: exportSupplementStatusEnum,
    amount: z.number().nullable(),
    requestedAt: z.string().datetime().nullable(),
    deadline: z.string().datetime().nullable(),
  }),
  orders: z.array(z.object({
    id: z.string().uuid(),
    orderNumber: z.string(),
    supplierId: z.string().uuid(),
    shopName: z.string(),
    status: z.string(),
    /** Handed to eBio (the order is DELIVERED). */
    collected: z.boolean(),
    totalAmount: z.number(),
    lines: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      quantity: z.number(),
      totalPrice: z.number(),
      imageUrl: z.string().nullable(),
      /** Taken out of the parcel after the shop was paid. */
      removed: z.boolean(),
    })),
  })),
  events: z.array(z.object({
    id: z.string().uuid(),
    step: exportShipmentStatusEnum.nullable(),
    message: z.string().nullable(),
    pickupPoint: z.string().nullable(),
    author: z.string().nullable(),
    at: z.string().datetime(),
  })),
  trackingToken: z.string(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'ExportAdminShipment',
  description: 'Valise côté back-office : commandes par boutique, poids, complément, historique',
})

export type ExportAdminShipment = z.infer<typeof exportAdminShipmentSchema>

// ===== §5 BACK-OFFICE, DESTINATION COUNTRIES =====

const countryPhrase = z.string().trim().min(3).max(120)

export const exportCountryInputSchema = z.object({
  code: exportCountryCodeSchema,
  /** « France », « Pays-Bas ». */
  name: z.string().trim().min(2).max(80),
  /** « vers la France », « vers le Canada », « vers les Pays-Bas ». */
  toPhrase: countryPhrase,
  /** « en France », « au Canada », « aux Pays-Bas ». */
  inPhrase: countryPhrase,
  /** What a buyer there reads prices in when the app does not say. */
  displayCurrency: foreignCurrencyEnum,
  flagEmoji: z.string().trim().min(1).max(16).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
}).meta({
  title: 'ExportCountryInput',
  description: 'Pays de destination : code ISO, nom, tournures « vers » et « en », devise d\'affichage',
})

export type ExportCountryInput = z.infer<typeof exportCountryInputSchema>

export const updateExportCountrySchema = exportCountryInputSchema.omit({ code: true }).partial().meta({
  title: 'UpdateExportCountry',
  description: 'Champs d\'un pays de destination à modifier ; isActive: false le ferme aux nouvelles valises',
})

export type UpdateExportCountry = z.infer<typeof updateExportCountrySchema>

export const exportCountryAdminSchema = z.object({
  code: z.string(),
  name: z.string(),
  toPhrase: z.string(),
  inPhrase: z.string(),
  displayCurrency: foreignCurrencyEnum,
  flagEmoji: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  counts: z.object({
    pickupPoints: z.number(),
    /** Open departures, order deadline not passed, with a rate towards the country. */
    openDepartures: z.number(),
    /** Paid parcels still travelling. */
    activeShipments: z.number(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).meta({
  title: 'ExportCountryAdmin',
  description: 'Pays de destination côté back-office, avec ses points de retrait, départs ouverts et colis en cours',
})

export type ExportCountryAdmin = z.infer<typeof exportCountryAdminSchema>

// ===== §1 CLIENT, DESTINATION COUNTRIES =====

export const terroirCountriesQuerySchema = z.object({
  /** 'true': every active country, a departure or not (« Me prévenir du prochain départ »). */
  all: z.enum(['true', 'false']).default('false'),
}).meta({
  title: 'TerroirCountriesQuery',
  description: 'Pays proposés : ceux qui ont un départ ouvert, ou tous les pays actifs',
})

export type TerroirCountriesQuery = z.infer<typeof terroirCountriesQuerySchema>

export const terroirCountrySchema = z.object({
  code: z.string(),
  name: z.string(),
  toPhrase: z.string(),
  inPhrase: z.string(),
  displayCurrency: foreignCurrencyEnum,
  flagEmoji: z.string().nullable(),
  /** An open departure has a rate towards it: a parcel can be ordered now. */
  hasOpenDeparture: z.boolean(),
}).meta({
  title: 'TerroirCountry',
  description: 'Pays de destination proposé au client',
})

export type TerroirCountry = z.infer<typeof terroirCountrySchema>
