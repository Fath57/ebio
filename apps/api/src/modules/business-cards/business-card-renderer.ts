import type { CardLogo } from './business-card-logo'
import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import PDFDocument from 'pdfkit'
import { create as createQr } from 'qrcode'
import { LOGO_B, LOGO_BOX, LOGO_E, LOGO_I, LOGO_LEAF, LOGO_PIN, PIN_WINDOW } from './business-card-brand'
import { cardInitials, nameFontSize, wrapLines } from './business-card-text'

export interface CardContent {
  name: string
  place: string
  /** Where the QR code leads. */
  url: string
  logo: CardLogo | null
}

/** Two columns of four cards: the room between them is the 3 mm bleed of each. */
const CARD = { width: 85, height: 55 }
const BLEED = 3
const COLUMNS = 2
const ROWS = 4
const CELL = { width: CARD.width + 2 * BLEED, height: CARD.height + 2 * BLEED }
const A4 = { width: 210, height: 297 }
const MARGIN = {
  x: (A4.width - COLUMNS * CELL.width) / 2,
  y: (A4.height - ROWS * CELL.height) / 2,
}

const RING = { x: 61.5, y: 27.5, radius: 22.5, rotation: -78 }
const QR_SIDE = 27
const LOGO_SLOT = { x: 15.5, y: 15, radius: 10.5 }
const TEXT_COLUMN = { x: 5, width: 25, bottom: 42.5 }

const SCAN_LABEL = 'SCANNEZ POUR COMMANDER'
const PLACE_SIZE = 6.8
const NAME_LINE_HEIGHT = 1.14
const PLACE_LINE_HEIGHT = 1.3

const GREEN_600 = '#1e7a37'
const BLUE_600 = '#335289'
const INK = '#141410'
const GREY = '#5A5852'

const FONT_MEDIUM = 'jakarta-medium'
const FONT_BOLD = 'jakarta-bold'

const POINTS_PER_MM = 72 / 25.4

function mm(value: number): number {
  return value * POINTS_PER_MM
}

type Pdf = PDFKit.PDFDocument

/** What pdfkit hands back for an opened image; only ever passed back to it. */
type OpenedImage = Parameters<Pdf['image']>[0]

/** Exists at runtime but is missing from the published types. */
function openImage(doc: Pdf, png: Buffer): OpenedImage {
  return (doc as unknown as { openImage: (source: Buffer) => OpenedImage }).openImage(png)
}

function drawRing(doc: Pdf): void {
  const scale = RING.radius / PIN_WINDOW.radius
  doc.save()
    .translate(mm(RING.x), mm(RING.y))
    .rotate(RING.rotation)
    .scale(mm(scale))
    .translate(-PIN_WINDOW.x, -PIN_WINDOW.y)
    .path(LOGO_PIN)
    .fill(GREEN_600, 'non-zero')
    .restore()
}

/** Set by hand, letter by letter: pdfkit has no text on a path. */
function drawScanLabel(doc: Pdf): void {
  const size = mm(2.15)
  const tracking = mm(0.24)
  const radius = mm(RING.radius + 1.1)
  doc.font(FONT_BOLD).fontSize(size).fillColor('#ffffff')

  const widths = [...SCAN_LABEL].map(letter => doc.widthOfString(letter) + tracking)
  const total = widths.reduce((sum, width) => sum + width, 0) - tracking
  let along = -total / 2

  ;[...SCAN_LABEL].forEach((letter, index) => {
    const width = widths[index]! - tracking
    const degrees = ((along + width / 2) / radius) * (180 / Math.PI)
    doc.save()
      .translate(mm(RING.x), mm(RING.y))
      .rotate(degrees)
      .text(letter, -width / 2, -radius, { lineBreak: false, baseline: 'alphabetic' })
      .restore()
    along += widths[index]!
  })
}

function drawQr(doc: Pdf, url: string): void {
  // Level Q: a card goes in a pocket, it can lose a corner and still scan.
  const { modules } = createQr(url, { errorCorrectionLevel: 'Q' })
  const module = mm(QR_SIDE) / modules.size
  const originX = mm(RING.x - QR_SIDE / 2)
  const originY = mm(RING.y - QR_SIDE / 2)
  // Each row runs a hair into the next, or viewers show thin seams between them.
  const overlap = module * 0.02

  doc.save()
  for (let row = 0; row < modules.size; row++) {
    let column = 0
    while (column < modules.size) {
      if (!modules.get(row, column)) {
        column++
        continue
      }
      const start = column
      while (column < modules.size && modules.get(row, column))
        column++
      doc.rect(originX + start * module, originY + row * module, (column - start) * module, module + overlap)
    }
  }
  doc.fill(INK).restore()
}

function drawSupplierLogo(doc: Pdf, content: CardContent, images: Map<CardLogo, OpenedImage>): void {
  const { x, y, radius } = LOGO_SLOT
  const { logo } = content
  if (!logo) {
    const size = radius * 1.6
    doc.font(FONT_BOLD).fontSize(size).fillColor(GREEN_600)
    const initials = cardInitials(content.name)
    doc.text(initials, mm(x) - doc.widthOfString(initials) / 2, mm(y) + size * 0.35, { lineBreak: false, baseline: 'alphabetic' })
    return
  }

  let image = images.get(logo)
  if (!image) {
    image = openImage(doc, logo.png)
    images.set(logo, image)
  }

  if (logo.kind === 'bare') {
    const side = mm(2 * radius)
    doc.image(image, mm(x - radius), mm(y - radius), { fit: [side, side], align: 'center', valign: 'center' })
    return
  }

  const side = mm(2 * radius * 0.8)
  doc.save().circle(mm(x), mm(y), mm(radius)).fill(logo.background).restore()
  doc.save().circle(mm(x), mm(y), mm(radius)).clip()
  doc.image(image, mm(x) - side / 2, mm(y) - side / 2, { fit: [side, side], align: 'center', valign: 'center' })
  doc.restore()
}

/** The block sits on a fixed bottom line and grows upward, toward the logo. */
function drawNameAndPlace(doc: Pdf, content: CardContent): void {
  const column = mm(TEXT_COLUMN.width)
  const x = mm(TEXT_COLUMN.x)
  let bottom = mm(TEXT_COLUMN.bottom)

  doc.font(FONT_MEDIUM).fontSize(PLACE_SIZE)
  const placeLines = wrapLines(content.place, column, line => doc.widthOfString(line))
  const placeStep = PLACE_SIZE * PLACE_LINE_HEIGHT
  placeLines.forEach((line, index) => {
    const baseline = bottom - (placeLines.length - 1 - index) * placeStep - PLACE_SIZE * 0.3
    doc.fillColor(GREY).text(line, x, baseline, { lineBreak: false, baseline: 'alphabetic' })
  })
  if (placeLines.length > 0)
    bottom -= placeLines.length * placeStep + mm(1)

  const size = nameFontSize(content.name, column)
  const tracking = -0.012 * size
  doc.font(FONT_BOLD).fontSize(size)
  const nameLines = wrapLines(content.name, column, line => doc.widthOfString(line, { characterSpacing: tracking }))
  const nameStep = size * NAME_LINE_HEIGHT
  nameLines.forEach((line, index) => {
    const baseline = bottom - (nameLines.length - 1 - index) * nameStep - size * 0.2
    doc.fillColor(INK).text(line, x, baseline, { lineBreak: false, baseline: 'alphabetic', characterSpacing: tracking })
  })
}

function drawEbioLogo(doc: Pdf): void {
  const width = 13
  const height = width * (LOGO_BOX.height / LOGO_BOX.width)
  const scale = mm(width / LOGO_BOX.width)
  doc.save()
    .translate(mm(TEXT_COLUMN.x), mm(CARD.height - 4.2 - height))
    .scale(scale)
    .translate(-LOGO_BOX.x, -LOGO_BOX.y)
  for (const [path, colour] of [[LOGO_LEAF, GREEN_600], [LOGO_PIN, GREEN_600], [LOGO_E, BLUE_600], [LOGO_B, GREEN_600], [LOGO_I, GREEN_600]] as const)
    doc.path(path).fill(colour, 'non-zero')
  doc.restore()
}

function drawCard(doc: Pdf, content: CardContent, images: Map<CardLogo, OpenedImage>, column: number, row: number): void {
  const cellX = MARGIN.x + column * CELL.width
  const cellY = MARGIN.y + row * CELL.height

  doc.save()
  doc.rect(mm(cellX), mm(cellY), mm(CELL.width), mm(CELL.height)).clip()
  doc.translate(mm(cellX + BLEED), mm(cellY + BLEED))
  drawRing(doc)
  drawScanLabel(doc)
  drawQr(doc, content.url)
  drawSupplierLogo(doc, content, images)
  drawNameAndPlace(doc, content)
  drawEbioLogo(doc)
  doc.restore()
}

/** Marks in the page margin only: a card cut a little off shows no leftover line. */
function drawCropMarks(doc: Pdf): void {
  const xs = Array.from({ length: COLUMNS }, (_, c) => MARGIN.x + c * CELL.width + BLEED)
    .flatMap(left => [left, left + CARD.width])
  const ys = Array.from({ length: ROWS }, (_, r) => MARGIN.y + r * CELL.height + BLEED)
    .flatMap(top => [top, top + CARD.height])

  doc.save().lineWidth(mm(0.12)).strokeColor(INK)
  for (const x of xs) {
    doc.moveTo(mm(x), mm(MARGIN.y - 6)).lineTo(mm(x), mm(MARGIN.y - 1))
    doc.moveTo(mm(x), mm(A4.height - MARGIN.y + 1)).lineTo(mm(x), mm(A4.height - MARGIN.y + 6))
  }
  for (const y of ys) {
    doc.moveTo(mm(MARGIN.x - 6), mm(y)).lineTo(mm(MARGIN.x - 1), mm(y))
    doc.moveTo(mm(A4.width - MARGIN.x + 1), mm(y)).lineTo(mm(A4.width - MARGIN.x + 6), mm(y))
  }
  doc.stroke().restore()
}

function drawSheet(doc: Pdf, content: CardContent, images: Map<CardLogo, OpenedImage>): void {
  doc.addPage({ size: 'A4', margin: 0 })
  drawCropMarks(doc)
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++)
      drawCard(doc, content, images, column, row)
  }
  doc.font(FONT_MEDIUM).fontSize(6).fillColor(GREY).text(
    `${content.name} · imprimer à 100 %, sans ajustement à la page · cartes 85 × 55 mm`,
    mm(MARGIN.x + BLEED),
    mm(A4.height - MARGIN.y + 7),
    { lineBreak: false },
  )
}

/** One A4 page per shop, eight identical cards each, ready to print and cut. */
export function renderBusinessCards(contents: CardContent[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      info: { Title: 'Cartes de visite eBio', Author: 'eBio' },
    })
    const fonts = join(process.cwd(), 'public', 'fonts')
    doc.registerFont(FONT_MEDIUM, join(fonts, 'PlusJakartaSans_500Medium.ttf'))
    doc.registerFont(FONT_BOLD, join(fonts, 'PlusJakartaSans_700Bold.ttf'))

    const chunks: Buffer[] = []
    doc.on('data', chunk => chunks.push(chunk as Buffer))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    // A logo goes into the file once, however many cards reuse it.
    const images = new Map<CardLogo, OpenedImage>()
    for (const content of contents)
      drawSheet(doc, content, images)
    doc.end()
  })
}
