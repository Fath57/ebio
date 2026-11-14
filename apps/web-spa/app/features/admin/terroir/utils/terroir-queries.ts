import type {
  AdminExportProduct,
  AdminExportProductsFilter,
  AdminExportProductsPage,
  CancelDepartureResult,
  ExportAdminShipment,
  ExportAgency,
  ExportAgencyInput,
  ExportCountryAdmin,
  ExportCountryInput,
  ExportCountryUpdate,
  ExportDeparture,
  ExportDepartureDetail,
  ExportDepartureInput,
  ExportDepartureRate,
  ExportDepartureStatus,
  ExportFill,
  ExportPack,
  ExportPackInput,
  ExportPackScope,
  ExportPackStatus,
  ExportPickupPoint,
  ExportPickupPointInput,
  ExportShipmentEventInput,
  ExportShipmentStatus,
} from './terroir-types'
import {
  adminExportControllerCancelDeparture,
  adminExportControllerCollect,
  adminExportControllerCreateAgency,
  adminExportControllerCreateCountry,
  adminExportControllerCreateDeparture,
  adminExportControllerCreatePack,
  adminExportControllerCreatePickupPoint,
  adminExportControllerDepartureDetail,
  adminExportControllerDepartureEvent,
  adminExportControllerHandedOver,
  adminExportControllerListAgencies,
  adminExportControllerListCountries,
  adminExportControllerListDepartures,
  adminExportControllerListPacks,
  adminExportControllerListProducts,
  adminExportControllerLost,
  adminExportControllerManifest,
  adminExportControllerMissing,
  adminExportControllerReinstatePack,
  adminExportControllerReinstateProduct,
  adminExportControllerRetirePack,
  adminExportControllerShipment,
  adminExportControllerShipmentEvent,
  adminExportControllerUpdateAgency,
  adminExportControllerUpdateCountry,
  adminExportControllerUpdateDeparture,
  adminExportControllerUpdatePack,
  adminExportControllerUpdatePickupPoint,
  adminExportControllerWeigh,
  adminExportControllerWithdrawPack,
  adminExportControllerWithdrawProduct,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { keepPreviousData } from '@tanstack/react-query'

export const TERROIR_KEY = ['admin', 'terroir'] as const

export const terroirKeys = {
  countries: [...TERROIR_KEY, 'countries'] as const,
  agencies: [...TERROIR_KEY, 'agencies'] as const,
  departures: (status?: ExportDepartureStatus) => [...TERROIR_KEY, 'departures', status ?? 'all'] as const,
  departuresRoot: [...TERROIR_KEY, 'departures'] as const,
  departure: (id: string) => [...TERROIR_KEY, 'departure', id] as const,
  shipment: (id: string) => [...TERROIR_KEY, 'shipment', id] as const,
  products: (filter: AdminExportProductsFilter) => [...TERROIR_KEY, 'products', filter] as const,
  exportableProducts: (search: string) => [...TERROIR_KEY, 'products', 'exportable', search] as const,
  productsRoot: [...TERROIR_KEY, 'products'] as const,
  packs: (scope: ExportPackScope, status?: ExportPackStatus) => [...TERROIR_KEY, 'packs', scope, status ?? 'all'] as const,
  packsRoot: [...TERROIR_KEY, 'packs'] as const,
}

/** A refusal of the API, with its machine code (`EXPORT_COUNTRY_EXISTS`…) when it sent one. */
export class TerroirApiError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message)
    this.name = 'TerroirApiError'
  }
}

/** The API explains a refusal in French (`{ code, message }`); that sentence is what the staff reads. */
function fail(error: unknown, fallback = ''): never {
  const body = error as { message?: unknown, code?: unknown } | undefined
  const message = typeof body?.message === 'string' ? body.message : fallback
  throw new TerroirApiError(message, typeof body?.code === 'string' ? body.code : null)
}

function toNullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value)
}

// ===== NORMALISERS (numeric strings → numbers) =====

function toCountry(raw: ExportCountryAdmin): ExportCountryAdmin {
  return {
    ...raw,
    sortOrder: Number(raw.sortOrder),
    counts: {
      pickupPoints: Number(raw.counts?.pickupPoints ?? 0),
      openDepartures: Number(raw.counts?.openDepartures ?? 0),
      activeShipments: Number(raw.counts?.activeShipments ?? 0),
    },
  }
}

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
    missingCount: Number(raw.missingCount),
    linesTotal: Number(raw.linesTotal),
    difference: Number(raw.difference),
    items: raw.items.map(item => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })),
  }
}

function toExportProduct(raw: AdminExportProduct): AdminExportProduct {
  return {
    ...raw,
    missingCount: Number(raw.missingCount),
    packedWeightG: toNullableNumber(raw.packedWeightG),
    shelfLifeDays: toNullableNumber(raw.shelfLifeDays),
    lengthCm: toNullableNumber(raw.lengthCm),
    widthCm: toNullableNumber(raw.widthCm),
    heightCm: toNullableNumber(raw.heightCm),
  }
}

function toExportProductsPage(raw: AdminExportProductsPage): AdminExportProductsPage {
  return {
    data: raw.data.map(toExportProduct),
    total: Number(raw.total),
    page: Number(raw.page),
    pageSize: Number(raw.pageSize),
    counts: {
      EXPORTABLE: Number(raw.counts?.EXPORTABLE ?? 0),
      INCOMPLETE: Number(raw.counts?.INCOMPLETE ?? 0),
      WITHDRAWN: Number(raw.counts?.WITHDRAWN ?? 0),
    },
  }
}

// ===== QUERIES =====

/** Every destination country, active or not, in the order the apps show them. */
export function countriesQueryOptions() {
  return {
    queryKey: terroirKeys.countries,
    queryFn: async () => {
      const response = await adminExportControllerListCountries()
      if (response.error)
        fail(response.error, 'Failed to load countries')
      return (response.data as ExportCountryAdmin[])
        .map(toCountry)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'))
    },
  }
}

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

/** One page of the products offered for export, with the count of each status for the tabs. */
export function exportProductsQueryOptions(filter: AdminExportProductsFilter) {
  return {
    queryKey: terroirKeys.products(filter),
    queryFn: async () => {
      const response = await adminExportControllerListProducts({
        query: { status: filter.status, page: filter.page, ...(filter.search ? { search: filter.search } : {}) },
      })
      if (response.error)
        fail(response.error, 'Failed to load export products')
      return toExportProductsPage(response.data as AdminExportProductsPage)
    },
    placeholderData: keepPreviousData,
  }
}

/** The first exportable products matching a search, for the eBio pack picker. */
export function exportableProductsQueryOptions(search: string) {
  return {
    queryKey: terroirKeys.exportableProducts(search),
    queryFn: async () => {
      const response = await adminExportControllerListProducts({
        query: { status: 'EXPORTABLE', page: 1, ...(search ? { search } : {}) },
      })
      if (response.error)
        fail(response.error, 'Failed to load export products')
      return toExportProductsPage(response.data as AdminExportProductsPage).data
    },
    placeholderData: keepPreviousData,
  }
}

export function packsQueryOptions(scope: ExportPackScope, status?: ExportPackStatus) {
  return {
    queryKey: terroirKeys.packs(scope, status),
    queryFn: async () => {
      const response = await adminExportControllerListPacks({ query: { scope, ...(status ? { status } : {}) } })
      if (response.error)
        fail(response.error, 'Failed to load packs')
      return (response.data as ExportPack[]).map(toPack)
    },
  }
}

// ===== DESTINATION COUNTRIES =====

export async function createCountry(body: ExportCountryInput): Promise<ExportCountryAdmin> {
  const response = await adminExportControllerCreateCountry({ body })
  if (response.error)
    fail(response.error)
  return toCountry(response.data as ExportCountryAdmin)
}

export async function updateCountry(code: string, body: ExportCountryUpdate): Promise<ExportCountryAdmin> {
  const response = await adminExportControllerUpdateCountry({ path: { code }, body })
  if (response.error)
    fail(response.error)
  return toCountry(response.data as ExportCountryAdmin)
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

// ===== EXPORT WATCH AND PACKS =====

/** Takes a product off the export whatever its criteria; the shop gets the reason. */
export async function withdrawProduct(productId: string, reason: string): Promise<AdminExportProduct> {
  const response = await adminExportControllerWithdrawProduct({ path: { productId }, body: { reason } })
  if (response.error)
    fail(response.error)
  return toExportProduct(response.data as AdminExportProduct)
}

/** Lifts the withdrawal: exportable again at once when every criterion is met. */
export async function reinstateProduct(productId: string): Promise<AdminExportProduct> {
  const response = await adminExportControllerReinstateProduct({ path: { productId } })
  if (response.error)
    fail(response.error)
  return toExportProduct(response.data as AdminExportProduct)
}

export async function withdrawPack(id: string, reason: string): Promise<ExportPack> {
  const response = await adminExportControllerWithdrawPack({ path: { id }, body: { reason } })
  if (response.error)
    fail(response.error)
  return toPack(response.data as ExportPack)
}

export async function reinstatePack(id: string): Promise<ExportPack> {
  const response = await adminExportControllerReinstatePack({ path: { id } })
  if (response.error)
    fail(response.error)
  return toPack(response.data as ExportPack)
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
