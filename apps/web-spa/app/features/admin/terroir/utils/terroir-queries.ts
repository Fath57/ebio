import type {
  CancelDepartureResult,
  ExportAdminShipment,
  ExportAgency,
  ExportAgencyInput,
  ExportChecklistKey,
  ExportDeparture,
  ExportDepartureDetail,
  ExportDepartureInput,
  ExportDepartureRate,
  ExportDepartureStatus,
  ExportFill,
  ExportPack,
  ExportPackInput,
  ExportPickupPoint,
  ExportPickupPointInput,
  ExportProfileStatus,
  ExportReviewDecision,
  ExportReviews,
  ExportShipmentEventInput,
  ExportShipmentStatus,
} from './terroir-types'
import {
  adminExportControllerCancelDeparture,
  adminExportControllerCollect,
  adminExportControllerCreateAgency,
  adminExportControllerCreateDeparture,
  adminExportControllerCreatePack,
  adminExportControllerCreatePickupPoint,
  adminExportControllerDepartureDetail,
  adminExportControllerDepartureEvent,
  adminExportControllerHandedOver,
  adminExportControllerListAgencies,
  adminExportControllerListDepartures,
  adminExportControllerListPacks,
  adminExportControllerLost,
  adminExportControllerManifest,
  adminExportControllerMissing,
  adminExportControllerRetirePack,
  adminExportControllerReviewPack,
  adminExportControllerReviewProduct,
  adminExportControllerReviews,
  adminExportControllerShipment,
  adminExportControllerShipmentEvent,
  adminExportControllerUpdateAgency,
  adminExportControllerUpdateDeparture,
  adminExportControllerUpdatePack,
  adminExportControllerUpdatePickupPoint,
  adminExportControllerWeigh,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export const TERROIR_KEY = ['admin', 'terroir'] as const

export const terroirKeys = {
  agencies: [...TERROIR_KEY, 'agencies'] as const,
  departures: (status?: ExportDepartureStatus) => [...TERROIR_KEY, 'departures', status ?? 'all'] as const,
  departuresRoot: [...TERROIR_KEY, 'departures'] as const,
  departure: (id: string) => [...TERROIR_KEY, 'departure', id] as const,
  shipment: (id: string) => [...TERROIR_KEY, 'shipment', id] as const,
  reviews: (status: ExportProfileStatus) => [...TERROIR_KEY, 'reviews', status] as const,
  reviewsRoot: [...TERROIR_KEY, 'reviews'] as const,
  packs: [...TERROIR_KEY, 'packs'] as const,
}

/** The API explains a refusal in French (`{ code, message }`); that sentence is what the staff reads. */
function fail(error: unknown, fallback = ''): never {
  const message = (error as { message?: unknown } | undefined)?.message
  throw new Error(typeof message === 'string' ? message : fallback)
}

function toNullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value)
}

// ===== NORMALISERS (numeric strings → numbers) =====

function toPickupPoint(raw: ExportPickupPoint): ExportPickupPoint {
  return { ...raw }
}

function toAgency(raw: ExportAgency): ExportAgency {
  return { ...raw, pickupPoints: (raw.pickupPoints ?? []).map(toPickupPoint) }
}

function toRate(raw: ExportDepartureRate): ExportDepartureRate {
  return {
    country: raw.country,
    pricePerKg: Number(raw.pricePerKg),
    minBilledKg: Number(raw.minBilledKg),
    maxWeightKg: toNullableNumber(raw.maxWeightKg),
    homeDeliveryFee: toNullableNumber(raw.homeDeliveryFee),
  }
}

function toFill(raw: ExportFill): ExportFill {
  return {
    reservedKg: Number(raw.reservedKg),
    capacityKg: toNullableNumber(raw.capacityKg),
    ratio: toNullableNumber(raw.ratio),
  }
}

function toDeparture(raw: ExportDeparture): ExportDeparture {
  return {
    ...raw,
    transitMinDays: Number(raw.transitMinDays),
    transitMaxDays: Number(raw.transitMaxDays),
    rates: raw.rates.map(toRate),
    fill: toFill(raw.fill),
    shipmentCount: Number(raw.shipmentCount),
  }
}

function toDepartureDetail(raw: ExportDepartureDetail): ExportDepartureDetail {
  return {
    ...toDeparture(raw),
    shipments: raw.shipments.map(row => ({
      ...row,
      estimatedWeightG: Number(row.estimatedWeightG),
      actualWeightG: toNullableNumber(row.actualWeightG),
    })),
    collection: raw.collection.map(shop => ({
      ...shop,
      lines: shop.lines.map(line => ({ ...line, quantity: Number(line.quantity) })),
    })),
  }
}

function toShipment(raw: ExportAdminShipment): ExportAdminShipment {
  return {
    ...raw,
    estimatedWeightG: Number(raw.estimatedWeightG),
    actualWeightG: toNullableNumber(raw.actualWeightG),
    shippingPrice: Number(raw.shippingPrice),
    homeDeliveryFee: Number(raw.homeDeliveryFee),
    insurancePrice: Number(raw.insurancePrice),
    declaredValue: Number(raw.declaredValue),
    supplement: { ...raw.supplement, amount: toNullableNumber(raw.supplement.amount) },
    orders: raw.orders.map(order => ({
      ...order,
      totalAmount: Number(order.totalAmount),
      lines: order.lines.map(line => ({ ...line, quantity: Number(line.quantity), totalPrice: Number(line.totalPrice) })),
    })),
  }
}

function toPack(raw: ExportPack): ExportPack {
  return {
    ...raw,
    price: Number(raw.price),
    linesTotal: Number(raw.linesTotal),
    difference: Number(raw.difference),
    items: raw.items.map(item => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })),
  }
}

function toReviews(raw: ExportReviews): ExportReviews {
  return {
    products: raw.products.map(product => ({
      ...product,
      packedWeightG: Number(product.packedWeightG),
      shelfLifeDays: Number(product.shelfLifeDays),
      lengthCm: toNullableNumber(product.lengthCm),
      widthCm: toNullableNumber(product.widthCm),
      heightCm: toNullableNumber(product.heightCm),
    })),
    packs: raw.packs.map(toPack),
  }
}

// ===== QUERIES =====

export function agenciesQueryOptions() {
  return {
    queryKey: terroirKeys.agencies,
    queryFn: async () => {
      const response = await adminExportControllerListAgencies()
      if (response.error)
        fail(response.error, 'Failed to load agencies')
      return (response.data as ExportAgency[]).map(toAgency)
    },
  }
}

export function departuresQueryOptions(status?: ExportDepartureStatus) {
  return {
    queryKey: terroirKeys.departures(status),
    queryFn: async () => {
      const response = await adminExportControllerListDepartures({ query: status ? { status } : {} })
      if (response.error)
        fail(response.error, 'Failed to load departures')
      return (response.data as ExportDeparture[]).map(toDeparture)
    },
  }
}

export function departureDetailQueryOptions(id: string) {
  return {
    queryKey: terroirKeys.departure(id),
    queryFn: async () => {
      const response = await adminExportControllerDepartureDetail({ path: { id } })
      if (response.error)
        fail(response.error, 'Failed to load departure')
      return toDepartureDetail(response.data as ExportDepartureDetail)
    },
    enabled: Boolean(id),
  }
}

export function shipmentQueryOptions(id: string) {
  return {
    queryKey: terroirKeys.shipment(id),
    queryFn: async () => {
      const response = await adminExportControllerShipment({ path: { id } })
      if (response.error)
        fail(response.error, 'Failed to load shipment')
      return toShipment(response.data as ExportAdminShipment)
    },
    enabled: Boolean(id),
  }
}

export function reviewsQueryOptions(status: ExportProfileStatus) {
  return {
    queryKey: terroirKeys.reviews(status),
    queryFn: async () => {
      const response = await adminExportControllerReviews({ query: { status } })
      if (response.error)
        fail(response.error, 'Failed to load reviews')
      return toReviews(response.data as ExportReviews)
    },
  }
}

export function packsQueryOptions() {
  return {
    queryKey: terroirKeys.packs,
    queryFn: async () => {
      const response = await adminExportControllerListPacks()
      if (response.error)
        fail(response.error, 'Failed to load packs')
      return (response.data as ExportPack[]).map(toPack)
    },
  }
}

// ===== AGENCIES AND PICKUP POINTS =====

export async function saveAgency(id: string | null, body: ExportAgencyInput): Promise<ExportAgency> {
  const response = id
    ? await adminExportControllerUpdateAgency({ path: { id }, body })
    : await adminExportControllerCreateAgency({ body })
  if (response.error)
    fail(response.error)
  return toAgency(response.data as ExportAgency)
}

export async function savePickupPoint(agencyId: string, pointId: string | null, body: ExportPickupPointInput): Promise<ExportPickupPoint> {
  const response = pointId
    ? await adminExportControllerUpdatePickupPoint({ path: { id: agencyId, pointId }, body })
    : await adminExportControllerCreatePickupPoint({ path: { id: agencyId }, body })
  if (response.error)
    fail(response.error)
  return toPickupPoint(response.data as ExportPickupPoint)
}

// ===== DEPARTURES =====

/** A creation opens the departure; an edit may also close, reopen or mark it gone in the same call. */
export async function saveDeparture(
  id: string | null,
  input: ExportDepartureInput,
  status?: Exclude<ExportDepartureStatus, 'CANCELLED'>,
): Promise<ExportDeparture> {
  const body = { ...input, depositDeadline: new Date(input.depositDeadline) }
  const response = id
    ? await adminExportControllerUpdateDeparture({ path: { id }, body: { ...body, ...(status ? { status } : {}) } })
    : await adminExportControllerCreateDeparture({ body })
  if (response.error)
    fail(response.error)
  return toDeparture(response.data as ExportDeparture)
}

export async function cancelDeparture(id: string, reassignTo: string | null): Promise<CancelDepartureResult> {
  const response = await adminExportControllerCancelDeparture({ path: { id }, body: { reassignTo } })
  if (response.error)
    fail(response.error)
  const raw = response.data as CancelDepartureResult
  return { departure: toDeparture(raw.departure), reassigned: Number(raw.reassigned), surcharge: Number(raw.surcharge) }
}

export async function addDepartureEvent(id: string, step: ExportShipmentStatus, message: string | null): Promise<number> {
  const response = await adminExportControllerDepartureEvent({ path: { id }, body: { step, message } })
  if (response.error)
    fail(response.error)
  return Number((response.data as { applied: number }).applied)
}

/**
 * The printable list is HTML behind the staff session: fetched with the
 * cookie, then shown from a blob in the tab opened on the click (opening it
 * before the request keeps popup blockers quiet).
 */
export async function openManifest(id: string): Promise<void> {
  const tab = window.open('', '_blank')
  const response = await adminExportControllerManifest({ path: { id }, parseAs: 'text' })
  if (response.error) {
    tab?.close()
    fail(response.error)
  }
  const blob = new Blob([String(response.data)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  if (tab)
    tab.location.href = url
  else
    window.location.assign(url)
}

// ===== PARCELS =====

async function shipmentAction(call: Promise<{ data?: unknown, error?: unknown }>): Promise<ExportAdminShipment> {
  const response = await call
  if (response.error)
    fail(response.error)
  return toShipment(response.data as ExportAdminShipment)
}

export function collectShipment(id: string, supplierId: string) {
  return shipmentAction(adminExportControllerCollect({ path: { id }, body: { supplierId } }))
}

export function markLineMissing(id: string, orderItemId: string) {
  return shipmentAction(adminExportControllerMissing({ path: { id }, body: { orderItemId } }))
}

export function weighShipment(id: string, actualWeightG: number) {
  return shipmentAction(adminExportControllerWeigh({ path: { id }, body: { actualWeightG } }))
}

export function addShipmentEvent(id: string, body: ExportShipmentEventInput) {
  return shipmentAction(adminExportControllerShipmentEvent({ path: { id }, body }))
}

export function handOverShipment(id: string) {
  return shipmentAction(adminExportControllerHandedOver({ path: { id } }))
}

export function markShipmentLost(id: string, damaged: boolean) {
  return shipmentAction(adminExportControllerLost({ path: { id }, body: { damaged } }))
}

// ===== REVIEWS AND PACKS =====

export async function reviewProduct(
  productId: string,
  decision: ExportReviewDecision,
  checklist: Partial<Record<ExportChecklistKey, boolean>>,
  reason: string | null,
): Promise<void> {
  const response = await adminExportControllerReviewProduct({ path: { id: productId }, body: { decision, checklist, reason } })
  if (response.error)
    fail(response.error)
}

export async function reviewPack(packId: string, decision: ExportReviewDecision, reason: string | null): Promise<void> {
  const response = await adminExportControllerReviewPack({ path: { id: packId }, body: { decision, reason } })
  if (response.error)
    fail(response.error)
}

export async function savePack(id: string | null, body: ExportPackInput): Promise<ExportPack> {
  const response = id
    ? await adminExportControllerUpdatePack({ path: { id }, body })
    : await adminExportControllerCreatePack({ body })
  if (response.error)
    fail(response.error)
  return toPack(response.data as ExportPack)
}

export async function retirePack(id: string): Promise<ExportPack> {
  const response = await adminExportControllerRetirePack({ path: { id } })
  if (response.error)
    fail(response.error)
  return toPack(response.data as ExportPack)
}
