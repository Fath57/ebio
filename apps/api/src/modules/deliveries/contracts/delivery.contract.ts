import { z } from 'zod'

export const vehicleTypeEnum = z.enum(['MOTO', 'BICYCLE', 'CAR', 'ON_FOOT']).meta({
  title: 'VehicleType',
  description: 'Vehicle used by the courier',
})

export const courierValidationStatusEnum = z.enum([
  'PENDING',
  'VALIDATED',
  'REJECTED',
  'COMPLEMENT_REQUESTED',
  'SUSPENDED',
]).meta({
  title: 'CourierValidationStatus',
  description: 'Validation status of a courier application',
})

export const deliveryStatusEnum = z.enum([
  'AWAITING_COURIER',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
]).meta({
  title: 'DeliveryStatus',
  description: 'Current status of a delivery',
})

export const deliveryFailReasonEnum = z.enum([
  'CUSTOMER_ABSENT',
  'ADDRESS_NOT_FOUND',
  'CUSTOMER_REFUSED',
  'OTHER',
]).meta({
  title: 'DeliveryFailReason',
  description: 'Why a delivery could not be completed',
})

export const deliveryEventTypeEnum = z.enum([
  'CREATED',
  'BROADCAST',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'REASSIGNED',
  'ORDER_CANCELLED',
  'SELF_DELIVERED',
  'ASSIGNED_BY_ADMIN',
  'OFFERED',
  'OFFER_DECLINED',
  'OFFER_EXPIRED',
]).meta({
  title: 'DeliveryEventType',
  description: 'Type of a delivery timeline event',
})

// ===== Courier profile =====

export const registerCourierSchema = z.object({
  fullName: z.string().min(2).max(255),
  phone: z.string().regex(/^\+229\d{10}$/),
  vehicleType: vehicleTypeEnum,
  zone: z.string().min(2).max(255),
  zoneLatitude: z.number().min(-90).max(90).optional(),
  zoneLongitude: z.number().min(-180).max(180).optional(),
  zoneRadiusKm: z.number().min(1).max(100).optional(),
  identityDocument: z.string().max(255).optional(),
}).meta({
  title: 'RegisterCourier',
  description: 'Courier application data',
  examples: [
    {
      fullName: 'Jean Hounkpatin',
      phone: '+2290197000000',
      vehicleType: 'MOTO',
      zone: 'Cotonou — Akpakpa',
    },
  ],
})

export const updateCourierSchema = registerCourierSchema.partial().meta({
  title: 'UpdateCourier',
  description: 'Editable courier profile fields',
})

export const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
}).meta({
  title: 'UpdateCourierAvailability',
  description: 'Toggle courier availability (online / offline)',
})

export const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).meta({
  title: 'UpdateCourierLocation',
  description: 'Foreground position update',
})

export const courierProfileResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string(),
  phone: z.string(),
  vehicleType: vehicleTypeEnum,
  zone: z.string(),
  zoneLatitude: z.number().nullable(),
  zoneLongitude: z.number().nullable(),
  zoneRadiusKm: z.number().nullable(),
  identityDocument: z.string().nullable(),
  validationStatus: courierValidationStatusEnum,
  rejectionReason: z.string().nullable(),
  isAvailable: z.boolean(),
  /** Average buyer rating (1–5), null until the first rating. */
  ratingAvg: z.number().nullable(),
  ratingCount: z.number(),
  /** Set when the courier is kept out of dispatch (wallet debt past the limit). */
  dispatchBlock: z.object({
    reason: z.enum(['DEBT']),
    balance: z.number(),
    limit: z.number(),
  }).nullable(),
  validatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'CourierProfileResponse',
  description: 'Courier profile and application status',
})

// ===== Delivery transitions =====

/**
 * occurredAt supports the offline replay queue: the courier app stamps the
 * real moment of the action. Server-side it is clamped to [previous event, now].
 */
export const transitionSchema = z.object({
  occurredAt: z.string().datetime().optional(),
}).meta({
  title: 'DeliveryTransition',
  description: 'Common payload for delivery step transitions',
})

export const completeDeliverySchema = z.discriminatedUnion('proofType', [
  z.object({
    proofType: z.literal('CODE'),
    code: z.string().regex(/^\d{4}$/),
    occurredAt: z.string().datetime().optional(),
  }),
  z.object({
    proofType: z.literal('PHOTO'),
    mediaId: z.string().min(1).max(255),
    occurredAt: z.string().datetime().optional(),
  }),
]).meta({
  title: 'CompleteDelivery',
  description: 'Proof of delivery: buyer confirmation code or photo',
})

export const failDeliverySchema = z.object({
  reason: deliveryFailReasonEnum,
  comment: z.string().max(500).optional(),
  occurredAt: z.string().datetime().optional(),
}).meta({
  title: 'FailDelivery',
  description: 'Report a failed delivery attempt',
})

// ===== Responses =====

export const deliveryOfferSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  /** Courier → shop, from the courier's live position (or zone centre). */
  distanceKm: z.number().nullable(),
  /** Shop → buyer's pinned drop-off point; null when the buyer gave no point. */
  routeKm: z.number().nullable(),
  dropoffPosition: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  deliveryFee: z.number(),
  courierFee: z.number(),
  supplierShopName: z.string(),
  itemsCount: z.number(),
  totalAmount: z.number(),
  paymentMethod: z.string(),
  /** Cash order: what the courier collects from the buyer at the door (null otherwise). */
  cashToCollect: z.number().nullable(),
  /** Cash order: what the courier hands the shop at pickup, i.e. the goods (null otherwise). */
  cashToShop: z.number().nullable(),
  /** True when this run is offered to this courier alone, until expiresAt. */
  isTargeted: z.boolean(),
  /** End of the exclusive window (null on broadcast offers). */
  expiresAt: z.string().datetime().nullable(),
  /** When the shop expects the parcel to be ready; null for legacy runs. */
  pickupReadyAt: z.string().datetime().nullable(),
  offeredAt: z.string().datetime(),
}).meta({
  title: 'DeliveryOffer',
  description: 'A delivery available for couriers nearby',
})

export const deliveryEventSchema = z.object({
  type: deliveryEventTypeEnum,
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()).nullable(),
}).meta({
  title: 'DeliveryEvent',
  description: 'One entry of the delivery timeline',
})

export const deliveryContactSchema = z.object({
  name: z.string(),
  phone: z.string().nullable(),
}).meta({
  title: 'DeliveryContact',
  description: 'Contact shown to the courier or follower of a delivery',
})

export const geoPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
}).meta({
  title: 'GeoPoint',
  description: 'WGS84 coordinates',
})

export const courierPositionSchema = geoPointSchema.extend({
  updatedAt: z.string().datetime().nullable(),
}).meta({
  title: 'CourierPosition',
  description: 'Last reported courier position, for the live tracking map',
})

export const deliveryCourierSchema = deliveryContactSchema.extend({
  /** Average buyer rating (1–5), null until the first rating. */
  ratingAvg: z.number().nullable(),
  ratingCount: z.number(),
}).meta({
  title: 'DeliveryCourier',
  description: 'Courier identity and reputation shown to the buyer and the shop',
})

export const courierRatingResponseSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'CourierRatingResponse',
  description: 'The rating the buyer left on a delivery',
})

export const deliveryResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  status: deliveryStatusEnum,
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  supplierShopName: z.string(),
  /**
   * La tournée dont cette livraison fait partie. Elle porte l'avancement que
   * l'acheteur suit — une progression pour tout son panier — et le moment où
   * la plateforme lui rend la main faute de livreur.
   */
  run: z.object({
    id: z.string().uuid(),
    shopCount: z.number().int().positive(),
    collectedCount: z.number().int().min(0),
    awaitingBuyerDecision: z.boolean(),
  }).nullable(),
  /** Buyer contact — only present for the assigned courier. */
  buyerContact: deliveryContactSchema.nullable(),
  /** Courier identity — present for supplier/buyer once assigned. */
  courier: deliveryCourierSchema.nullable(),
  courierVehicleType: vehicleTypeEnum.nullable(),
  /** Live position — only while the delivery is in progress. */
  courierPosition: courierPositionSchema.nullable(),
  /** Shop position snapshot, for the tracking map. */
  pickupPosition: geoPointSchema.nullable(),
  /** Drop-off point picked by the buyer at checkout (null for legacy orders). */
  dropoffPosition: geoPointSchema.nullable(),
  /** Confirmation code — only present for the buyer. */
  confirmationCode: z.string().nullable(),
  proofType: z.enum(['CODE', 'PHOTO']).nullable(),
  failReason: deliveryFailReasonEnum.nullable(),
  failComment: z.string().nullable(),
  itemsCount: z.number(),
  totalAmount: z.number(),
  paymentMethod: z.string(),
  /** Cash order: what the courier collects from the buyer at the door (null otherwise). */
  cashToCollect: z.number().nullable(),
  /** Cash order: what the courier hands the shop at pickup, i.e. the goods (null otherwise). */
  cashToShop: z.number().nullable(),
  /** Buyer-paid delivery fee snapshotted when the run was offered. */
  deliveryFee: z.number(),
  /** The courier's share of that fee (integer FCFA). */
  courierFee: z.number(),
  /** Tip the buyer left after delivery (integer FCFA), 0 when none. */
  tipAmount: z.number(),
  /** The buyer's rating of the courier, null until given. */
  buyerRating: courierRatingResponseSchema.nullable(),
  /** Early dispatch: shop readiness estimate, planned and actual search start. */
  pickupReadyAt: z.string().datetime().nullable(),
  dispatchAt: z.string().datetime().nullable(),
  dispatchStartedAt: z.string().datetime().nullable(),
  acceptedAt: z.string().datetime().nullable(),
  pickedUpAt: z.string().datetime().nullable(),
  inTransitAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  events: z.array(deliveryEventSchema),
  createdAt: z.string().datetime(),
}).meta({
  title: 'DeliveryResponse',
  description: 'Full delivery details, shaped per audience',
})

export const rejectCourierSchema = z.object({
  reason: z.string().min(5).max(500),
}).meta({
  title: 'RejectCourier',
  description: 'Reason shown to the rejected courier applicant',
})

export const mineFilterEnum = z.enum(['active', 'done']).meta({
  title: 'CourierDeliveriesFilter',
  description: 'active = accepted/picked up/in transit; done = delivered/failed',
})

// ===== Buyer feedback on the courier =====

export const rateCourierSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
}).meta({
  title: 'RateCourier',
  description: 'Buyer rating of the courier once the delivery is done',
})

export const TIP_MIN_AMOUNT = 100
export const TIP_MAX_AMOUNT = 50_000

export const tipCourierSchema = z.object({
  /** Integer FCFA, paid from the buyer's personal wallet. */
  amount: z.number().int().min(TIP_MIN_AMOUNT).max(TIP_MAX_AMOUNT),
}).meta({
  title: 'TipCourier',
  description: 'Tip for the courier, debited from the buyer wallet and credited in full to the courier',
})

export const courierTipResponseSchema = z.object({
  amount: z.number(),
  /** Buyer wallet balance after the tip. */
  walletBalance: z.number(),
  createdAt: z.string().datetime(),
}).meta({
  title: 'CourierTipResponse',
  description: 'Confirmation of a tip paid to the courier',
})

export type RateCourier = z.infer<typeof rateCourierSchema>
export type TipCourier = z.infer<typeof tipCourierSchema>
export type CourierRatingResponse = z.infer<typeof courierRatingResponseSchema>
export type CourierTipResponse = z.infer<typeof courierTipResponseSchema>

export type RegisterCourier = z.infer<typeof registerCourierSchema>
export type UpdateCourier = z.infer<typeof updateCourierSchema>
export type UpdateAvailability = z.infer<typeof updateAvailabilitySchema>
export type UpdateLocation = z.infer<typeof updateLocationSchema>
export type CourierProfileResponse = z.infer<typeof courierProfileResponseSchema>
export type DeliveryTransition = z.infer<typeof transitionSchema>
export type CompleteDelivery = z.infer<typeof completeDeliverySchema>
export type FailDelivery = z.infer<typeof failDeliverySchema>
export type DeliveryOffer = z.infer<typeof deliveryOfferSchema>
export type DeliveryResponse = z.infer<typeof deliveryResponseSchema>
export type DeliveryEventDto = z.infer<typeof deliveryEventSchema>

// ─── Back-office assignment ──────────────────────────────────────────────────

export const assignDeliverySchema = z.object({
  courierId: z.string().uuid(),
  /** Free text passed along in the courier's notification (e.g. "client pressé"). */
  note: z.string().trim().max(300).optional(),
}).meta({
  title: 'AssignDelivery',
  description: 'Back-office assignment of a delivery to a chosen courier',
})

export const courierCandidateSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  phone: z.string(),
  vehicleType: vehicleTypeEnum,
  zone: z.string(),
  isAvailable: z.boolean(),
  /** Where the courier is drawn on the map: fresh GPS fix, declared zone centre, or nothing. */
  positionSource: z.enum(['GPS', 'ZONE']).nullable(),
  position: geoPointSchema.nullable(),
  lastLocationAt: z.string().datetime().nullable(),
  /** Distance from the pickup point in km, null when neither side has a position. */
  distanceKm: z.number().nullable(),
  /** Deliveries currently accepted, picked up or in transit. */
  activeDeliveries: z.number(),
  deliveredCount: z.number(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number(),
  /** True when this courier already holds the delivery being assigned. */
  isCurrent: z.boolean(),
}).meta({
  title: 'CourierCandidate',
  description: 'A validated courier ranked for a back-office assignment',
})

export type AssignDelivery = z.infer<typeof assignDeliverySchema>
export type CourierCandidate = z.infer<typeof courierCandidateSchema>

/**
 * Ce que l'acheteur répond quand aucun livreur ne prend sa commande, même
 * dégroupée. Deux issues seulement : patienter, ou récupérer son argent.
 */
export const buyerDecisionSchema = z.object({
  decision: z.enum(['WAIT', 'CANCEL']),
}).meta({
  title: 'BuyerDecision',
  description: 'Attendre encore, ou annuler et être recrédité',
})
