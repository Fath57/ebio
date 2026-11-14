import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../utils/api-client'

/**
 * Client calls of the « Terroir vers l'étranger » module (contracts/terroir-export.md §1–§3).
 *
 * Every payload is read field by field from untyped JSON: the API answers in
 * FCFA, with a `display` block in the payer's currency next to the amounts.
 */

/** A destination country code, ISO 3166-1 alpha-2 (« FR », « CA »). The list is data, managed in the back-office. */
export type TerroirCountry = string

// ---------------------------------------------------------------------------
// Errors

/** French wording for the refusals the API names by `code` (contract §2). */
const ERROR_MESSAGES: Record<string, string> = {
  DEPARTURE_UNAVAILABLE: 'Ce départ n’est plus disponible : il est complet, sa date limite est passée ou votre colis dépasse le poids accepté. Choisissez un autre départ.',
  TERROIR_LINE_UNAVAILABLE: 'Un article de votre valise n’est plus disponible à l’export. Retirez-le pour continuer.',
  PICKUP_POINT_REQUIRED: 'Choisissez un point de retrait pour ce départ.',
  HOME_DELIVERY_UNAVAILABLE: 'L’agence de ce départ ne livre pas à domicile. Choisissez le retrait à l’agence.',
  EXPORT_COUNTRY_UNKNOWN: 'La Valise du pays ne part pas vers ce pays.',
  EXPORT_COUNTRY_INACTIVE: 'Les envois vers ce pays sont suspendus pour le moment.',
  EXPORT_COUNTRY_EXISTS: 'Ce pays est déjà proposé.',
  TERROIR_DISABLED: 'La Valise du pays n’est pas encore ouverte. Revenez bientôt.',
}

export class TerroirError extends Error {
  readonly code: string | null

  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
}

export function terroirErrorMessage(code: string | null | undefined, fallback: string): string {
  return (code ? ERROR_MESSAGES[code] : undefined) ?? fallback
}

async function readError(res: Response, fallback: string): Promise<TerroirError> {
  const body = await res.json().catch(() => null) as Record<string, unknown> | null
  const code = typeof body?.code === 'string' ? body.code : null
  const serverMessage = typeof body?.message === 'string' && body.message !== 'Validation failed' ? body.message : null
  return new TerroirError(terroirErrorMessage(code, serverMessage ?? fallback), code)
}

async function getJson(path: string, fallback: string): Promise<unknown> {
  const res = await apiFetch(path)
  if (!res.ok)
    throw await readError(res, fallback)
  return res.json() as Promise<unknown>
}

async function sendJson(path: string, method: 'POST' | 'DELETE', body: unknown, fallback: string): Promise<unknown> {
  const res = await apiFetch(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok)
    throw await readError(res, fallback)
  if (res.status === 204)
    return null
  return res.json().catch(() => null) as Promise<unknown>
}

// ---------------------------------------------------------------------------
// Field readers

type Raw = Record<string, unknown>

function obj(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {}
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []
}

function list(value: unknown): Raw[] {
  const source = Array.isArray(value) ? value : (obj(value).items ?? obj(value).data)
  return Array.isArray(source) ? source.map(obj) : []
}

/** A `display` block: amounts already converted by the server, keyed like the FCFA fields. */
export interface DisplayBlock {
  currency: 'EUR' | 'USD' | 'CAD'
  values: Record<string, number>
}

function readDisplay(value: unknown): DisplayBlock | null {
  const block = obj(value)
  const currency = block.currency
  if (currency !== 'EUR' && currency !== 'USD' && currency !== 'CAD')
    return null
  const values: Record<string, number> = {}
  for (const [key, entry] of Object.entries(block)) {
    const amount = num(entry)
    if (key !== 'currency' && amount !== null)
      values[key] = amount
  }
  return { currency, values }
}

// ---------------------------------------------------------------------------
// Destination countries (§1)

export interface TerroirCountryInfo {
  code: TerroirCountry
  /** « France », « Pays-Bas ». */
  name: string
  /** « vers la France », « vers le Canada ». */
  toPhrase: string
  /** « en France », « au Canada », « aux Pays-Bas ». */
  inPhrase: string
  displayCurrency: DisplayBlock['currency']
  flagEmoji: string | null
  /** An open departure serves it: a parcel can be ordered now. */
  hasOpenDeparture: boolean
}

function readCountry(raw: Raw): TerroirCountryInfo | null {
  const code = str(raw.code)
  const name = str(raw.name)
  if (!code || !name)
    return null
  const currency = raw.displayCurrency
  return {
    code,
    name,
    toPhrase: str(raw.toPhrase) ?? `vers ${name}`,
    inPhrase: str(raw.inPhrase) ?? `en ${name}`,
    displayCurrency: currency === 'USD' || currency === 'CAD' ? currency : 'EUR',
    flagEmoji: str(raw.flagEmoji),
    hasOpenDeparture: raw.hasOpenDeparture === true,
  }
}

/** Last known lists: the offered countries, and every active one (`all=true`). */
const countriesCache: { offered: TerroirCountryInfo[] | null, all: TerroirCountryInfo[] | null } = { offered: null, all: null }

/**
 * Destination countries, in the back-office order. By default only those an
 * open departure serves; `all` lists every active country, for the alert of
 * the next departure.
 */
export async function fetchTerroirCountries(all = false): Promise<TerroirCountryInfo[]> {
  const data = await getJson(`/api/terroir/countries?all=${all ? 'true' : 'false'}`, 'Impossible de charger les pays desservis.')
  const countries = list(data).map(readCountry).filter((country): country is TerroirCountryInfo => country !== null)
  if (all)
    countriesCache.all = countries
  else
    countriesCache.offered = countries
  return countries
}

export function cachedTerroirCountries(all = false): TerroirCountryInfo[] | null {
  return all ? countriesCache.all : countriesCache.offered
}

/** A country from the last known lists, null when neither has it (an inactive one). */
export function terroirCountryInfo(code: TerroirCountry): TerroirCountryInfo | null {
  return countriesCache.offered?.find(country => country.code === code)
    ?? countriesCache.all?.find(country => country.code === code)
    ?? null
}

/** French name of a country the lists do not carry, from the platform when it can. */
function regionName(code: TerroirCountry): string {
  try {
    const names = new Intl.DisplayNames(['fr'], { type: 'region' })
    return names.of(code) ?? code
  }
  catch {
    return code
  }
}

export function countryName(code: TerroirCountry): string {
  return terroirCountryInfo(code)?.name ?? regionName(code)
}

/** « vers la France », « vers le Canada ». */
export function countryToPhrase(code: TerroirCountry): string {
  return terroirCountryInfo(code)?.toPhrase ?? `vers ${regionName(code)}`
}

/** « en France », « aux Pays-Bas ». */
export function countryInPhrase(code: TerroirCountry): string {
  return terroirCountryInfo(code)?.inPhrase ?? `en ${regionName(code)}`
}

/** « 🇫🇷 France » */
export function countryChipLabel(country: TerroirCountryInfo): string {
  return country.flagEmoji ? `${country.flagEmoji} ${country.name}` : country.name
}

/**
 * Loads a countries list once per mount, starting from the last known one, so
 * the name helpers above read fresh data. Null until a list is known.
 */
export function useTerroirCountries(all = false, active = true): TerroirCountryInfo[] | null {
  const [countries, setCountries] = useState<TerroirCountryInfo[] | null>(() => cachedTerroirCountries(all))

  useEffect(() => {
    if (!active)
      return
    let cancelled = false
    fetchTerroirCountries(all)
      .then((result) => {
        if (!cancelled)
          setCountries(result)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [all, active])

  return countries
}

// ---------------------------------------------------------------------------
// Catalog (§1)

export interface TerroirOrigin {
  producer: string | null
  place: string | null
  year: number | null
  method: string | null
  photos: string[]
}

function readOrigin(value: unknown): TerroirOrigin | null {
  const raw = obj(value)
  const origin: TerroirOrigin = {
    producer: str(raw.producer),
    place: str(raw.place),
    year: num(raw.year),
    method: str(raw.method),
    photos: strings(raw.photos),
  }
  return origin.producer || origin.place || origin.year || origin.method || origin.photos.length > 0 ? origin : null
}

export interface TerroirCatalogItem {
  kind: 'PRODUCT' | 'PACK'
  id: string
  name: string
  imageUrl: string | null
  price: number
  shopName: string | null
  badge: boolean
  packedWeightG: number | null
}

function readCatalogItem(raw: Raw, forcePack = false): TerroirCatalogItem | null {
  const isPack = forcePack || raw.kind === 'PACK' || raw.type === 'PACK' || typeof raw.packId === 'string'
  const id = str(isPack ? (raw.packId ?? raw.id) : (raw.productId ?? raw.id))
  const name = str(raw.name)
  const price = num(raw.price)
  if (!id || !name || price === null)
    return null
  return {
    kind: isPack ? 'PACK' : 'PRODUCT',
    id,
    name,
    imageUrl: str(raw.imageUrl) ?? strings(raw.photos)[0] ?? null,
    price,
    shopName: str(raw.shopName),
    badge: raw.badge === true,
    packedWeightG: num(raw.packedWeightG ?? raw.weightG),
  }
}

export interface TerroirCatalogPage {
  items: TerroirCatalogItem[]
  total: number
}

export async function fetchTerroirCatalog(country: TerroirCountry, currency: string, search?: string): Promise<TerroirCatalogPage> {
  const query = new URLSearchParams({ country, currency })
  if (search && search.trim().length > 0)
    query.set('search', search.trim())
  const data = await getJson(`/api/terroir/catalog?${query.toString()}`, 'Impossible de charger la Valise du pays.')
  // Packs first: they are the easiest way into the catalogue.
  const packs = Array.isArray(data) ? [] : list(obj(data).packs).map(entry => readCatalogItem(entry, true))
  const products = Array.isArray(data) ? data.map(entry => readCatalogItem(obj(entry))) : list(obj(data).products).map(entry => readCatalogItem(entry))
  const items = [...packs, ...products].filter((item): item is TerroirCatalogItem => item !== null)
  const total = num(obj(data).total) ?? items.length
  return { items, total }
}

export interface TerroirVariant {
  id: string
  label: string
  price: number
  packedWeightG: number | null
}

export interface TerroirProduct {
  id: string
  name: string
  description: string | null
  photos: string[]
  price: number
  unit: string | null
  shopName: string | null
  variants: TerroirVariant[]
  ingredients: string | null
  allergens: string[]
  conservation: string | null
  shelfLifeDays: number | null
  packedWeightG: number | null
  origin: TerroirOrigin | null
  badge: boolean
}

function readProduct(data: unknown): TerroirProduct {
  const raw = obj(data)
  const product = obj(raw.product)
  const source = Object.keys(product).length > 0 ? { ...raw, ...product } : raw
  const composition = obj(source.composition)
  const profile = obj(source.exportProfile ?? source.profile)
  return {
    id: str(source.id) ?? '',
    name: str(source.name) ?? '',
    description: str(source.description),
    photos: strings(source.photos).length > 0 ? strings(source.photos) : strings([source.imageUrl]),
    price: num(source.price ?? source.pricePerUnit) ?? 0,
    unit: str(source.unit),
    shopName: str(source.shopName) ?? str(obj(source.supplier).shopName),
    variants: list(source.variants)
      .map(variant => ({
        id: str(variant.id) ?? '',
        label: str(variant.label) ?? '',
        price: num(variant.price) ?? 0,
        packedWeightG: num(variant.weightG ?? variant.packedWeightG),
      }))
      .filter(variant => variant.id && variant.label),
    ingredients: str(composition.ingredients ?? source.ingredients),
    allergens: strings(composition.allergens ?? source.allergens),
    conservation: str(composition.conservation ?? source.conservation),
    shelfLifeDays: num(source.shelfLifeDays ?? profile.shelfLifeDays),
    packedWeightG: num(source.weightG ?? source.packedWeightG ?? profile.packedWeightG),
    origin: readOrigin(source.origin ?? profile.origin),
    badge: source.badge === true || profile.badge === true,
  }
}

export async function fetchTerroirProduct(id: string, currency: string): Promise<TerroirProduct> {
  return readProduct(await getJson(`/api/terroir/products/${id}?currency=${currency}`, 'Impossible de charger ce produit.'))
}

export interface TerroirPackItem {
  productId: string
  name: string
  quantity: number
  imageUrl: string | null
  shopName: string | null
  origin: TerroirOrigin | null
  badge: boolean
}

export interface TerroirPack {
  id: string
  name: string
  description: string | null
  photos: string[]
  price: number
  shopName: string | null
  items: TerroirPackItem[]
  orderable: boolean
  badge: boolean
}

export async function fetchTerroirPack(id: string, currency: string): Promise<TerroirPack> {
  const raw = obj(await getJson(`/api/terroir/packs/${id}?currency=${currency}`, 'Impossible de charger ce pack.'))
  return {
    id: str(raw.id) ?? id,
    name: str(raw.name) ?? '',
    description: str(raw.description),
    photos: strings(raw.photos),
    price: num(raw.price) ?? 0,
    shopName: str(raw.shopName),
    items: list(raw.items).map(item => ({
      productId: str(item.productId) ?? '',
      name: str(item.name) ?? '',
      quantity: num(item.quantity) ?? 1,
      imageUrl: str(item.imageUrl),
      shopName: str(item.shopName),
      origin: readOrigin(item.origin),
      badge: item.badge === true,
    })),
    orderable: raw.orderable !== false,
    badge: raw.badge === true,
  }
}

// ---------------------------------------------------------------------------
// Departures (§1)

export interface TerroirPickupPoint {
  id: string | null
  city: string | null
  address: string
  openingHours: string | null
}

function readPickupPoint(value: unknown): TerroirPickupPoint | null {
  const raw = obj(value)
  const address = str(raw.address)
  if (!address)
    return null
  return { id: str(raw.id), city: str(raw.city), address, openingHours: str(raw.openingHours) }
}

export interface TerroirDeparture {
  departureId: string
  agency: string
  departsOn: string
  arrivalFrom: string | null
  arrivalTo: string | null
  pricePerKg: number
  minBilledKg: number
  /** Null when the agency does not deliver to the door. */
  homeDeliveryFee: number | null
  shippingPrice: number | null
  displayShippingPrice: number | null
  displayCurrency: DisplayBlock['currency'] | null
  orderBefore: string | null
  /** When eBio must have collected the products from the shops. */
  collectBefore: string | null
  full: boolean
  pickupPoints: TerroirPickupPoint[]
}

function readDeparture(raw: Raw): TerroirDeparture | null {
  const departureId = str(raw.departureId ?? raw.id)
  const departsOn = str(raw.departsOn)
  if (!departureId || !departsOn)
    return null
  const arrival = obj(raw.arrival)
  const display = readDisplay(raw.display)
  const agency = typeof raw.agency === 'string' ? raw.agency : str(obj(raw.agency).name)
  return {
    departureId,
    agency: agency ?? 'Agence partenaire',
    departsOn,
    arrivalFrom: str(arrival.from),
    arrivalTo: str(arrival.to),
    pricePerKg: num(raw.pricePerKg) ?? 0,
    minBilledKg: num(raw.minBilledKg) ?? 0,
    homeDeliveryFee: num(raw.homeDeliveryFee),
    shippingPrice: num(raw.shippingPrice),
    displayShippingPrice: display?.values.shippingPrice ?? null,
    displayCurrency: display?.currency ?? null,
    orderBefore: str(raw.orderBefore),
    collectBefore: str(raw.collectBefore),
    full: raw.full === true,
    pickupPoints: (Array.isArray(raw.pickupPoints) ? raw.pickupPoints : [])
      .map(readPickupPoint)
      .filter((point): point is TerroirPickupPoint => point !== null),
  }
}

function readDepartures(value: unknown): TerroirDeparture[] {
  return list(value).map(readDeparture).filter((departure): departure is TerroirDeparture => departure !== null)
}

export interface TerroirNextDeparture {
  departureId: string
  city: string | null
  departsOn: string
  orderBefore: string | null
}

export interface TerroirDepartures {
  next: TerroirNextDeparture | null
  items: TerroirDeparture[]
  /** Whether the buyer already asked to be told of the next departure, when the API says. */
  alertSubscribed: boolean
}

export async function fetchTerroirDepartures(country: TerroirCountry, currency: string, weightG?: number): Promise<TerroirDepartures> {
  const query = new URLSearchParams({ country, currency })
  if (weightG && weightG > 0)
    query.set('weightG', String(Math.round(weightG)))
  const raw = obj(await getJson(`/api/terroir/departures?${query.toString()}`, 'Impossible de charger les départs.'))
  const next = obj(raw.next)
  const nextId = str(next.departureId)
  const nextDay = str(next.departsOn)
  return {
    next: nextId && nextDay
      ? { departureId: nextId, city: str(next.city), departsOn: nextDay, orderBefore: str(next.orderBefore) }
      : null,
    items: readDepartures(raw.items),
    alertSubscribed: raw.alertSubscribed === true,
  }
}

export async function subscribeDepartureAlert(country: TerroirCountry): Promise<void> {
  await sendJson('/api/terroir/departure-alerts', 'POST', { country }, 'Inscription à l’alerte impossible. Réessayez.')
}

export async function unsubscribeDepartureAlert(country: TerroirCountry): Promise<void> {
  await sendJson(`/api/terroir/departure-alerts/${country}`, 'DELETE', undefined, 'Désinscription impossible. Réessayez.')
}

// ---------------------------------------------------------------------------
// Checkout (§2)

export interface TerroirLineInput {
  productId?: string
  variantId?: string | null
  packId?: string
  quantity: number
}

export interface TerroirGiftInput {
  name: string
  email: string | null
  /** International format, « +33… ». */
  phone: string | null
  message: string | null
}

export interface TerroirCheckoutInput {
  country: TerroirCountry
  lines: TerroirLineInput[]
  departureId: string | null
  reception: 'PICKUP' | 'HOME'
  pickupPointId: string | null
  homeAddress: string | null
  insured: boolean
  gift: TerroirGiftInput | null
  paymentMethod: 'FEDAPAY' | 'WALLET'
  displayCurrency: string
}

export interface TerroirSuggestion {
  productId: string
  name: string
  weightG: number | null
  price: number
  imageUrl: string | null
}

export interface TerroirPreview {
  estimatedWeightG: number
  billedKg: number
  marginKg: number
  /** The departure the amounts are for, as the server chose it. */
  departureId: string | null
  /** What the options would cost; a null home fee means no door delivery. */
  optionHomeDeliveryFee: number | null
  optionInsurancePrice: number
  suggestions: TerroirSuggestion[]
  itemsTotal: number
  shippingPrice: number
  homeDeliveryFee: number
  insurancePrice: number
  total: number
  display: DisplayBlock | null
  departures: TerroirDeparture[]
  unavailable: Array<{ productId: string | null, packId: string | null, reason: string }>
}

function readPreview(data: unknown): TerroirPreview {
  const raw = obj(data)
  return {
    estimatedWeightG: num(raw.estimatedWeightG) ?? 0,
    billedKg: num(raw.billedKg) ?? 0,
    marginKg: num(raw.marginKg) ?? 0,
    departureId: str(raw.departureId),
    optionHomeDeliveryFee: num(obj(raw.options).homeDeliveryFee),
    optionInsurancePrice: num(obj(raw.options).insurancePrice) ?? 0,
    suggestions: list(raw.suggestions)
      .map(entry => ({
        productId: str(entry.productId) ?? '',
        name: str(entry.name) ?? '',
        weightG: num(entry.weightG),
        price: num(entry.price) ?? 0,
        imageUrl: str(entry.imageUrl),
      }))
      .filter(entry => entry.productId && entry.name),
    itemsTotal: num(raw.itemsTotal) ?? 0,
    shippingPrice: num(raw.shippingPrice) ?? 0,
    homeDeliveryFee: num(raw.homeDeliveryFee) ?? 0,
    insurancePrice: num(raw.insurancePrice) ?? 0,
    total: num(raw.total) ?? 0,
    display: readDisplay(raw.display),
    departures: readDepartures(raw.departures),
    unavailable: list(raw.unavailable).map(entry => ({
      productId: str(entry.productId),
      packId: str(entry.packId),
      reason: str(entry.reason) ?? 'UNAVAILABLE',
    })),
  }
}

function checkoutBody(input: TerroirCheckoutInput): Raw {
  return {
    country: input.country,
    lines: input.lines,
    ...(input.departureId ? { departureId: input.departureId } : {}),
    reception: input.reception,
    ...(input.reception === 'PICKUP' && input.pickupPointId ? { pickupPointId: input.pickupPointId } : {}),
    homeAddress: input.reception === 'HOME' ? input.homeAddress : null,
    insured: input.insured,
    ...(input.gift ? { gift: input.gift } : {}),
    paymentMethod: input.paymentMethod,
    displayCurrency: input.displayCurrency,
  }
}

export async function previewTerroirCheckout(input: TerroirCheckoutInput): Promise<TerroirPreview> {
  return readPreview(await sendJson('/api/terroir/checkout/preview', 'POST', checkoutBody(input), 'Impossible de calculer votre colis.'))
}

export interface TerroirCheckoutResult {
  checkoutId: string
  shipmentId: string
  paymentUrl: string | null
}

export async function createTerroirCheckout(input: TerroirCheckoutInput): Promise<TerroirCheckoutResult> {
  const raw = obj(await sendJson('/api/terroir/checkout', 'POST', checkoutBody(input), 'Impossible d’envoyer votre valise.'))
  return {
    checkoutId: str(raw.checkoutId) ?? '',
    shipmentId: str(raw.shipmentId) ?? '',
    paymentUrl: str(raw.paymentUrl),
  }
}

// ---------------------------------------------------------------------------
// Shipments (§3)

export type TerroirShipmentStatus
  = | 'PENDING_PAYMENT' | 'PAID' | 'COLLECTING' | 'PACKED' | 'DROPPED_AT_AGENCY' | 'DEPARTED'
    | 'ARRIVED' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'HANDED_OVER' | 'LOST' | 'DAMAGED' | 'CANCELLED'

export const SHIPMENT_STATUS_LABELS: Record<TerroirShipmentStatus, string> = {
  PENDING_PAYMENT: 'En attente de paiement',
  PAID: 'Payé',
  COLLECTING: 'Collecte chez les boutiques',
  PACKED: 'Colis préparé',
  DROPPED_AT_AGENCY: 'Déposé à l’agence',
  DEPARTED: 'Parti du Bénin',
  ARRIVED: 'Arrivé à destination',
  READY_FOR_PICKUP: 'Disponible au retrait',
  OUT_FOR_DELIVERY: 'En livraison',
  HANDED_OVER: 'Remis',
  LOST: 'Perdu',
  DAMAGED: 'Endommagé',
  CANCELLED: 'Annulé',
}

function readStatus(value: unknown): TerroirShipmentStatus {
  return typeof value === 'string' && value in SHIPMENT_STATUS_LABELS ? value as TerroirShipmentStatus : 'PAID'
}

export interface TerroirShipmentSummary {
  id: string
  status: TerroirShipmentStatus
  country: TerroirCountry
  agency: string | null
  departsOn: string | null
  arrivalFrom: string | null
  arrivalTo: string | null
  total: number
  displayTotal: number | null
  displayCurrency: DisplayBlock['currency'] | null
  giftName: string | null
  firstImageUrl: string | null
  lineCount: number
  createdAt: string | null
}

export interface TerroirShipmentLine {
  /** Order line id, sent back to remove the product from an overweight parcel. */
  id: string | null
  name: string
  quantity: number
  imageUrl: string | null
  shopName: string | null
}

export interface TerroirShipmentEvent {
  step: TerroirShipmentStatus | null
  message: string | null
  /** Address and hours as shown when the step was published. */
  pickupPoint: string | null
  at: string
}

export interface TerroirShipment extends TerroirShipmentSummary {
  reception: 'PICKUP' | 'HOME'
  pickupPoint: TerroirPickupPoint | null
  homeAddress: string | null
  lines: TerroirShipmentLine[]
  events: TerroirShipmentEvent[]
  insured: boolean
  giftMessage: string | null
  supplement: TerroirSupplement | null
  collectBefore: string | null
}

export type TerroirSupplementStatus = 'REQUESTED' | 'PAID' | 'WAIVED' | 'ITEM_REMOVED'

/** Extra transport asked once eBio has weighed the parcel (contract §3). */
export interface TerroirSupplement {
  amount: number
  display: DisplayBlock | null
  deadline: string | null
  status: TerroirSupplementStatus
  estimatedWeightG: number | null
  actualWeightG: number | null
}

const SUPPLEMENT_STATUSES: TerroirSupplementStatus[] = ['REQUESTED', 'PAID', 'WAIVED', 'ITEM_REMOVED']

/** The weights live on the shipment; the supplement card shows them. */
function withWeights(supplement: TerroirSupplement | null, shipment: Raw): TerroirSupplement | null {
  if (!supplement)
    return null
  return {
    ...supplement,
    estimatedWeightG: supplement.estimatedWeightG ?? num(shipment.estimatedWeightG),
    actualWeightG: supplement.actualWeightG ?? num(shipment.actualWeightG),
  }
}

function readSupplement(value: unknown): TerroirSupplement | null {
  const raw = obj(value)
  const amount = num(raw.amount)
  if (amount === null)
    return null
  const status = SUPPLEMENT_STATUSES.find(entry => entry === raw.status) ?? 'REQUESTED'
  return {
    amount,
    display: readDisplay(raw.display),
    deadline: str(raw.deadline),
    status,
    estimatedWeightG: num(raw.estimatedWeightG),
    actualWeightG: num(raw.actualWeightG),
  }
}

function readSummary(raw: Raw): TerroirShipmentSummary {
  const departure = obj(raw.departure)
  const arrival = obj(departure.arrival)
  const display = readDisplay(raw.display)
  const lines = list(raw.lines)
  const agency = typeof departure.agency === 'string' ? departure.agency : str(obj(departure.agency).name)
  return {
    id: str(raw.id) ?? '',
    status: readStatus(raw.status),
    country: str(raw.country) ?? '',
    agency,
    departsOn: str(departure.departsOn),
    arrivalFrom: str(arrival.from),
    arrivalTo: str(arrival.to),
    total: num(raw.total) ?? 0,
    displayTotal: display?.values.total ?? null,
    displayCurrency: display?.currency ?? null,
    giftName: str(obj(raw.gift).name),
    firstImageUrl: str(raw.imageUrl) ?? lines.map(line => str(line.imageUrl)).find(url => url !== null) ?? null,
    lineCount: num(raw.itemCount ?? raw.lineCount) ?? lines.length,
    createdAt: str(raw.createdAt),
  }
}

export async function fetchTerroirShipments(): Promise<TerroirShipmentSummary[]> {
  const data = await getJson('/api/terroir/shipments', 'Impossible de charger vos valises.')
  return list(data).map(readSummary).filter(shipment => shipment.id)
}

export async function fetchTerroirShipment(id: string): Promise<TerroirShipment> {
  const raw = obj(await getJson(`/api/terroir/shipments/${id}`, 'Impossible de charger ce colis.'))
  return {
    ...readSummary(raw),
    reception: raw.reception === 'HOME' ? 'HOME' : 'PICKUP',
    pickupPoint: readPickupPoint(raw.pickupPoint),
    homeAddress: str(raw.homeAddress),
    lines: list(raw.lines).map(line => ({
      id: str(line.id) ?? str(line.lineId) ?? str(line.orderItemId),
      name: str(line.name) ?? '',
      quantity: num(line.quantity) ?? 1,
      imageUrl: str(line.imageUrl),
      shopName: str(line.shopName),
    })),
    events: list(raw.events)
      .map(event => ({
        step: typeof event.step === 'string' && event.step in SHIPMENT_STATUS_LABELS ? event.step as TerroirShipmentStatus : null,
        message: str(event.message),
        pickupPoint: str(event.pickupPoint),
        at: str(event.at) ?? '',
      }))
      .filter(event => event.at && (event.step || event.message)),
    insured: raw.insured === true,
    giftMessage: str(obj(raw.gift).message),
    supplement: withWeights(readSupplement(raw.supplement), raw),
    collectBefore: str(obj(raw.departure).collectBefore),
  }
}

export interface TerroirSupplementPayment {
  paymentUrl: string | null
  providerTransactionId: string | null
  /** The wallet top-up that carries the card payment of the supplement. */
  topupId: string | null
}

/** Pays the weight supplement: the answer carries the hosted payment page to open. */
export async function payTerroirSupplement(shipmentId: string): Promise<TerroirSupplementPayment> {
  const raw = obj(await sendJson(`/api/terroir/shipments/${shipmentId}/supplement`, 'POST', { choice: 'PAY' }, 'Impossible de lancer le paiement du complément.'))
  return {
    paymentUrl: str(raw.paymentUrl),
    providerTransactionId: str(raw.providerTransactionId) ?? str(raw.reference),
    topupId: str(raw.topupId),
  }
}

/**
 * Asks the server to check the card payment of a supplement now, rather than
 * waiting for the periodic reconciliation. Never throws: the shipment detail
 * stays the source of truth.
 */
export async function verifySupplementPayment(topupId: string, providerTransactionId: string): Promise<void> {
  try {
    await apiFetch(`/api/wallet/me/topups/${topupId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ fedapayTransactionId: providerTransactionId }),
    })
  }
  catch {
    // The reconciliation job settles it later anyway.
  }
}

/** Takes one product out of the parcel instead of paying: it is refunded. */
export async function removeTerroirSupplementLine(shipmentId: string, lineId: string): Promise<void> {
  await sendJson(`/api/terroir/shipments/${shipmentId}/supplement`, 'POST', { choice: 'REMOVE_ITEM', lineId }, 'Impossible de retirer ce produit.')
}

// ---------------------------------------------------------------------------
// Switch

let enabledCache: boolean | null = null

/** Reads the switch once, outside navigation (providers). Unreadable means off. */
export async function fetchTerroirEnabled(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/settings/public')
    if (!res.ok)
      return enabledCache ?? false
    const data = await res.json() as Raw
    enabledCache = data.terroirExportEnabled === true
    return enabledCache
  }
  catch {
    return enabledCache ?? false
  }
}

/**
 * Whether eBio has opened the module (`terroirExportEnabled` in the public
 * settings). Absent or unreadable means off: every entry point hides. Read on
 * focus so a change in the back-office shows without a restart.
 */
export function useTerroirEnabled(): boolean {
  const [enabled, setEnabled] = useState(enabledCache ?? false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      async function load(): Promise<void> {
        try {
          const res = await apiFetch('/api/settings/public')
          if (!res.ok || cancelled)
            return
          const data = await res.json() as Raw
          enabledCache = data.terroirExportEnabled === true
          setEnabled(enabledCache)
        }
        catch {
          // keep the last known value
        }
      }
      load()
      return () => {
        cancelled = true
      }
    }, []),
  )

  return enabled
}

// ---------------------------------------------------------------------------
// Formatting

/** « 22 novembre » from an ISO day or instant. */
export function formatDay(iso: string | null): string {
  if (!iso)
    return ''
  const date = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (Number.isNaN(date.getTime()))
    return ''
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

/** « 29 novembre – 3 décembre » */
export function formatWindow(from: string | null, to: string | null): string {
  if (!from && !to)
    return ''
  if (!to || from === to)
    return formatDay(from ?? to)
  return `${formatDay(from)} – ${formatDay(to)}`
}

/** « 3,2 kg » */
export function formatKg(kg: number): string {
  return `${kg.toLocaleString('fr-FR', { maximumFractionDigits: 1 }).replace(/[\u202F\xA0]/g, ' ')} kg`
}
