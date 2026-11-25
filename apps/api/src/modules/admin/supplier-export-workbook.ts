import type { Worksheet } from 'exceljs'
import { Buffer } from 'node:buffer'
import { Workbook } from 'exceljs'
import { zoneOffsetMs } from '../sales-statements/statement-period'
import { DEFAULT_TIMEZONE, SupplierMode, SupplierType, ValidationStatus } from '../suppliers/supplier.entity'

export interface SupplierExportRow {
  shopName: string
  validationStatus: string
  type: string
  mode: string
  ownerName: string | null
  ownerPhone: string | null
  ownerEmail: string | null
  neighborhood: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  productCount: number
  orderCount: number
  lastOrderAt: Date | null
  deliveredRevenue: number
  walletBalance: number
  mobileMoneyNumber: string | null
  /** Fraction; null = the category rates apply. */
  commissionRate: number | null
  rating: number | null
  reviewCount: number
  createdAt: Date | null
  validatedAt: Date | null
}

const STATUS_LABELS: Record<string, string> = {
  [ValidationStatus.PENDING]: 'En attente',
  [ValidationStatus.COMPLEMENT_REQUESTED]: 'Complément demandé',
  [ValidationStatus.VALIDATED]: 'Validé',
  [ValidationStatus.SUSPENDED]: 'Suspendu',
  [ValidationStatus.REJECTED]: 'Rejeté',
}
const TYPE_LABELS: Record<string, string> = {
  [SupplierType.INPUTS]: 'Intrants',
  [SupplierType.TRANSFORMER]: 'Transformateur',
}
const MODE_LABELS: Record<string, string> = {
  [SupplierMode.ORDER]: 'Commande en ligne',
  [SupplierMode.CONTACT]: 'Mise en relation',
}

const MONEY = '#,##0 "FCFA";-#,##0 "FCFA";0 "FCFA"'
const DATE_TIME = 'dd/mm/yyyy hh:mm'
const PERCENT = '0.0%'
const HEADER_FILL = 'FFF7F6F2'

/** Excel has no time zone: the Benin wall clock is stored as if it were UTC. */
function toBeninClock(date: Date | null): Date | null {
  return date ? new Date(date.getTime() + zoneOffsetMs(DEFAULT_TIMEZONE, date)) : null
}

function styleHeader(sheet: Worksheet): void {
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FF2A2924' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  header.alignment = { vertical: 'middle' }
  header.height = 22
  // The shop's name stays in sight while scrolling across the columns.
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } }
}

/** One line per shop, in the order it is given. Phone numbers stay text: Excel would eat their « + ». */
export async function renderSupplierWorkbook(suppliers: SupplierExportRow[]): Promise<Buffer> {
  const workbook = new Workbook()
  workbook.creator = 'eBio'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Fournisseurs')
  sheet.columns = [
    { header: 'Boutique', key: 'shopName', width: 32 },
    { header: 'Statut', key: 'validationStatus', width: 20 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Mode', key: 'mode', width: 20 },
    { header: 'Responsable', key: 'ownerName', width: 26 },
    { header: 'Téléphone', key: 'ownerPhone', width: 18, style: { numFmt: '@' } },
    { header: 'E-mail', key: 'ownerEmail', width: 30 },
    { header: 'Quartier', key: 'neighborhood', width: 22 },
    { header: 'Adresse', key: 'address', width: 36 },
    { header: 'Latitude', key: 'latitude', width: 12, style: { numFmt: '0.000000' } },
    { header: 'Longitude', key: 'longitude', width: 12, style: { numFmt: '0.000000' } },
    { header: 'Produits en vente', key: 'productCount', width: 17 },
    { header: 'Commandes reçues', key: 'orderCount', width: 18 },
    { header: 'Dernière commande', key: 'lastOrderAt', width: 19, style: { numFmt: DATE_TIME } },
    { header: 'Ventes livrées', key: 'deliveredRevenue', width: 18, style: { numFmt: MONEY } },
    { header: 'Solde portefeuille', key: 'walletBalance', width: 18, style: { numFmt: MONEY } },
    { header: 'Numéro Mobile Money', key: 'mobileMoneyNumber', width: 22, style: { numFmt: '@' } },
    { header: 'Commission négociée', key: 'commissionRate', width: 20, style: { numFmt: PERCENT } },
    { header: 'Note', key: 'rating', width: 8, style: { numFmt: '0.0' } },
    { header: 'Avis', key: 'reviewCount', width: 8 },
    { header: 'Inscrit le', key: 'createdAt', width: 18, style: { numFmt: DATE_TIME } },
    { header: 'Validé le', key: 'validatedAt', width: 18, style: { numFmt: DATE_TIME } },
  ]
  sheet.addRows(suppliers.map(supplier => ({
    ...supplier,
    validationStatus: STATUS_LABELS[supplier.validationStatus] ?? supplier.validationStatus,
    type: TYPE_LABELS[supplier.type] ?? supplier.type,
    mode: MODE_LABELS[supplier.mode] ?? supplier.mode,
    lastOrderAt: toBeninClock(supplier.lastOrderAt),
    createdAt: toBeninClock(supplier.createdAt),
    validatedAt: toBeninClock(supplier.validatedAt),
  })))
  styleHeader(sheet)

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
