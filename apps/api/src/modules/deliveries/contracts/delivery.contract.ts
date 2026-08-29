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

export const deliveryResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  status: deliveryStatusEnum,
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  supplierShopName: z.string(),
  /** Buyer contact — only present for the assigned courier. */
  buyerContact: deliveryContactSchema.nullable(),
  /** Courier identity — present for supplier/buyer once assigned. */
  courier: deliveryContactSchema.nullable(),
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
  /** Buyer-paid delivery fee snapshotted when the run was offered. */
  deliveryFee: z.number(),
  /** The courier's share of that fee (integer FCFA). */
  courierFee: z.number(),
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
