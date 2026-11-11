import type { Worksheet } from 'exceljs'
import { Buffer } from 'node:buffer'
import { Workbook } from 'exceljs'

export interface StatementOrderRow {
  /** Wall-clock time of the shop, stored as if it were UTC so Excel shows it as-is. */
  placedAt: Date
  orderNumber: string
  buyerName: string
  status: string
  pickupMode: string
  paymentMethod: string
  itemCount: number
  itemsAmount: number
  discountAmount: number
  deliveryFee: number
  totalAmount: number
  commissionAmount: number
  /** Only for a delivered order: what the shop actually keeps. */
  shopShare: number | null
}

export interface StatementProductRow {
  name: string
  variant: string
  quantity: number
  giftQuantity: number
  amount: number
}

export interface StatementSummary {
  deliveredCount: number
  deliveredAmount: number
  commissionAmount: number
  shopShare: number
  inProgressCount: number
  inProgressAmount: number
  cancelledCount: number
}

export interface StatementContent {
  shopName: string
  periodLabel: string
  generatedAt: Date
  summary: StatementSummary
  orders: StatementOrderRow[]
  products: StatementProductRow[]
}

const MONEY = '#,##0 "FCFA";-#,##0 "FCFA";"–"'
const DATE_TIME = 'dd/mm/yyyy hh:mm'
// Excel takes ARGB, not our tokens: the e-mail layout's green.
const BRAND_GREEN = 'FF1E7A37'
const HEADER_FILL = 'FFF7F6F2'

function styleHeader(sheet: Worksheet): void {
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FF2A2924' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  header.alignment = { vertical: 'middle' }
  header.height = 22
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } }
}

function addSummarySheet(workbook: Workbook, content: StatementContent): void {
  const sheet = workbook.addWorksheet('Résumé')
  sheet.columns = [{ width: 38 }, { width: 22 }]

  const title = sheet.addRow([`Relevé des ventes — ${content.shopName}`])
  title.font = { bold: true, size: 14, color: { argb: BRAND_GREEN } }
  sheet.addRow([`Période : ${content.periodLabel}`])
  const generated = sheet.addRow(['Édité le', content.generatedAt])
  generated.getCell(2).numFmt = DATE_TIME
  sheet.addRow([])

  const { summary } = content
  const lines: Array<[string, number, boolean]> = [
    ['Commandes livrées', summary.deliveredCount, false],
    ['Montant payé par les clients (livrées)', summary.deliveredAmount, true],
    ['Commissions eBio', summary.commissionAmount, true],
    ['Part de la boutique', summary.shopShare, true],
    ['Commandes en cours', summary.inProgressCount, false],
    ['Montant des commandes en cours', summary.inProgressAmount, true],
    ['Commandes annulées', summary.cancelledCount, false],
  ]
  for (const [label, value, isMoney] of lines) {
    const row = sheet.addRow([label, value])
    row.getCell(1).font = { color: { argb: 'FF5C5A52' } }
    if (isMoney)
      row.getCell(2).numFmt = MONEY
    if (label === 'Part de la boutique')
      row.font = { bold: true }
  }

  sheet.addRow([])
  const note = sheet.addRow([
    'La part de la boutique déduit la commission eBio et les frais de livraison payés au livreur, et ajoute ce que eBio rembourse pour ses propres promotions. Seules les commandes livrées sont comptées.',
  ])
  sheet.mergeCells(note.number, 1, note.number, 2)
  note.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  note.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF9B9890' } }
  note.height = 48
}

function addOrdersSheet(workbook: Workbook, orders: StatementOrderRow[]): void {
  const sheet = workbook.addWorksheet('Commandes')
  sheet.columns = [
    { header: 'Date', key: 'placedAt', width: 17, style: { numFmt: DATE_TIME } },
    { header: 'N° commande', key: 'orderNumber', width: 18 },
    { header: 'Client', key: 'buyerName', width: 24 },
    { header: 'Statut', key: 'status', width: 16 },
    { header: 'Mode', key: 'pickupMode', width: 12 },
    { header: 'Paiement', key: 'paymentMethod', width: 14 },
    { header: 'Articles', key: 'itemCount', width: 10 },
    { header: 'Montant articles', key: 'itemsAmount', width: 16, style: { numFmt: MONEY } },
    { header: 'Remise', key: 'discountAmount', width: 13, style: { numFmt: MONEY } },
    { header: 'Livraison', key: 'deliveryFee', width: 13, style: { numFmt: MONEY } },
    { header: 'Total payé', key: 'totalAmount', width: 15, style: { numFmt: MONEY } },
    { header: 'Commission eBio', key: 'commissionAmount', width: 16, style: { numFmt: MONEY } },
    { header: 'Part boutique', key: 'shopShare', width: 15, style: { numFmt: MONEY } },
  ]
  sheet.addRows(orders)
  styleHeader(sheet)
}

function addProductsSheet(workbook: Workbook, products: StatementProductRow[]): void {
  const sheet = workbook.addWorksheet('Produits')
  sheet.columns = [
    { header: 'Produit', key: 'name', width: 34 },
    { header: 'Variante', key: 'variant', width: 18 },
    { header: 'Quantité vendue', key: 'quantity', width: 16 },
    { header: 'Dont offerts', key: 'giftQuantity', width: 13 },
    { header: 'Montant', key: 'amount', width: 16, style: { numFmt: MONEY } },
  ]
  sheet.addRows(products)
  styleHeader(sheet)
}

export async function renderStatementWorkbook(content: StatementContent): Promise<Buffer> {
  const workbook = new Workbook()
  workbook.creator = 'eBio'
  workbook.created = content.generatedAt
  addSummarySheet(workbook, content)
  addOrdersSheet(workbook, content.orders)
  addProductsSheet(workbook, content.products)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
