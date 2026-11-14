import { z } from 'zod'

// ===== ENUMS =====

/** Countries a terroir parcel can be sent to (v1). */
export enum ExportCountry {
  FR = 'FR',
  BE = 'BE',
}

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

export const exportCountryEnum = z.enum(ExportCountry).meta({
  title: 'ExportCountry',
  description: 'Pays de destination d\'un colis terroir',
})

export const exportProfileStatusEnum = z.enum(ExportProfileStatus).meta({
  title: 'ExportProfileStatus',
  description: 'Validation d\'un produit pour l\'export : en attente, validé, refusé',
})

export const exportPackStatusEnum = z.enum(ExportPackStatus).meta({
  title: 'ExportPackStatus',
  description: 'Validation d\'un pack terroir',
})

export const exportDepartureStatusEnum = z.enum(ExportDepartureStatus).meta({
  title: 'ExportDepartureStatus',
  description: 'Statut d\'un départ : ouvert, complet, annulé, parti',
})

export const exportShipmentStatusEnum = z.enum(ExportShipmentStatus).meta({
  title: 'ExportShipmentStatus',
  description: 'Étape d\'un colis terroir',
})

export const exportReviewDecisionEnum = z.enum(['APPROVE', 'REJECT']).meta({
  title: 'ExportReviewDecision',
  description: 'Décision d\'eBio sur un produit ou un pack',
})

const amount = z.number().positive().max(10_000_000)
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')

// ===== §5 BACK-OFFICE — AGENCIES =====

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
  country: exportCountryEnum,
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
  country: exportCountryEnum,
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

// ===== §5 BACK-OFFICE — DEPARTURES =====

export const exportDepartureRateInputSchema = z.object({
  country: exportCountryEnum,
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
  country: exportCountryEnum,
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
    country: exportCountryEnum,
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
      name: z.string(),
      quantity: z.number(),
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

// ===== §4 SHOP — EXPORT PROFILE =====

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

// ===== §4 SHOP / §5 BACK-OFFICE — PACKS =====

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
  description: 'Pack terroir : nom, description, photos, prix, produits',
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
  description: 'Pack terroir, boutique ou eBio',
})

export type ExportPackResponse = z.infer<typeof exportPackResponseSchema>

// ===== §5 BACK-OFFICE — REVIEWS =====

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
