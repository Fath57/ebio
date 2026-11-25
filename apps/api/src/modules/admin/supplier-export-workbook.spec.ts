import type { SupplierExportRow } from './supplier-export-workbook'
import { Workbook } from 'exceljs'
import { describe, expect, it } from 'vitest'
import { renderSupplierWorkbook } from './supplier-export-workbook'

function supplier(overrides: Partial<SupplierExportRow> = {}): SupplierExportRow {
  return {
    shopName: 'Ferme Adjallé',
    validationStatus: 'VALIDATED',
    type: 'TRANSFORMER',
    mode: 'ORDER',
    ownerName: 'Awa Dossou',
    ownerPhone: '+2290197000000',
    ownerEmail: 'awa@example.test',
    neighborhood: 'Fidjrossè',
    address: null,
    latitude: 6.35,
    longitude: 2.36,
    productCount: 4,
    orderCount: 12,
    lastOrderAt: new Date('2026-11-24T23:30:00Z'),
    deliveredRevenue: 45000,
    walletBalance: -1500,
    mobileMoneyNumber: '+2290197000000',
    commissionRate: 0.03,
    rating: 4.5,
    reviewCount: 2,
    createdAt: new Date('2026-10-01T08:00:00Z'),
    validatedAt: null,
    ...overrides,
  }
}

async function readSheet(rows: SupplierExportRow[]) {
  const workbook = new Workbook()
  const content = await renderSupplierWorkbook(rows)
  await workbook.xlsx.load(content as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const sheet = workbook.getWorksheet('Fournisseurs')!
  const headers = sheet.getRow(1).values as string[]
  return { sheet, cell: (row: number, header: string) => sheet.getRow(row).getCell(headers.indexOf(header)).value }
}

describe('renderSupplierWorkbook', () => {
  it('writes one line per shop, in French, keeping the given order', async () => {
    const { sheet, cell } = await readSheet([supplier(), supplier({ shopName: 'Jus du Lac', validationStatus: 'PENDING' })])
    expect(sheet.rowCount).toBe(3)
    expect(cell(2, 'Boutique')).toBe('Ferme Adjallé')
    expect(cell(2, 'Statut')).toBe('Validé')
    expect(cell(2, 'Mode')).toBe('Commande en ligne')
    expect(cell(3, 'Boutique')).toBe('Jus du Lac')
    expect(cell(3, 'Statut')).toBe('En attente')
  })

  it('keeps phone numbers as text and amounts as numbers', async () => {
    const { cell } = await readSheet([supplier()])
    expect(cell(2, 'Téléphone')).toBe('+2290197000000')
    expect(cell(2, 'Solde portefeuille')).toBe(-1500)
  })

  it('shows dates on the Benin clock and leaves unknown ones empty', async () => {
    const { cell } = await readSheet([supplier()])
    expect(cell(2, 'Dernière commande')).toEqual(new Date('2026-11-25T00:30:00Z'))
    expect(cell(2, 'Validé le')).toBeNull()
  })

  it('never turns a shop name into a formula', async () => {
    const { cell } = await readSheet([supplier({ shopName: '=1+1' })])
    expect(cell(2, 'Boutique')).toBe('=1+1')
  })

  it('still yields a file when no shop matches', async () => {
    const { sheet } = await readSheet([])
    expect(sheet.rowCount).toBe(1)
  })
})
