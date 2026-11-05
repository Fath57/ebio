import { Buffer } from 'node:buffer'
import sharp from 'sharp'

/** Twice what a 21 mm slot needs at print resolution: sharper would only weigh down the file. */
const MAX_SIDE_PX = 640
/** Colour distance, summed over RGB, still counted as the logo's background. */
const BACKGROUND_TOLERANCE = 36
/** Pale neutrals at or above this read as white once printed. */
const NEAR_WHITE = 232

export type CardLogo
  /** On a white background: printed straight on the white card, with no holder. */
  = | { kind: 'bare', png: Buffer }
  /** On a coloured background: a round holder in that colour hides the square. */
    | { kind: 'disc', png: Buffer, background: string }

interface Raster {
  data: Buffer
  width: number
  height: number
}

function pixel(image: Raster, x: number, y: number): [number, number, number] {
  const at = (y * image.width + x) * 3
  return [image.data[at]!, image.data[at + 1]!, image.data[at + 2]!]
}

/** Averaged just inside the corners: some logos carry a thin frame right on the edge. */
function backgroundColour(image: Raster): [number, number, number] {
  const { width, height } = image
  const inset = Math.max(4, Math.floor(Math.min(width, height) / 25))
  const samples = [
    pixel(image, inset, inset),
    pixel(image, width - 1 - inset, inset),
    pixel(image, inset, height - 1 - inset),
    pixel(image, width - 1 - inset, height - 1 - inset),
  ]
  return [0, 1, 2].map(channel => Math.floor(samples.reduce((sum, sample) => sum + sample[channel]!, 0) / 4)) as [number, number, number]
}

function isNeutralWhite([r, g, b]: [number, number, number]): boolean {
  return Math.min(r, g, b) >= 215 && Math.max(r, g, b) - Math.min(r, g, b) <= 12
}

/** Whitens the background from each corner: the artwork itself is never cropped. */
function whitenBackground(image: Raster): void {
  const { data, width, height } = image
  const visited = new Uint8Array(width * height)

  for (const [startX, startY] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]] as const) {
    const [r0, g0, b0] = pixel(image, startX, startY)
    const stack = [startY * width + startX]
    while (stack.length > 0) {
      const index = stack.pop()!
      if (visited[index])
        continue
      const at = index * 3
      const distance = Math.abs(data[at]! - r0) + Math.abs(data[at + 1]! - g0) + Math.abs(data[at + 2]! - b0)
      if (distance > BACKGROUND_TOLERANCE)
        continue
      visited[index] = 1
      const x = index % width
      if (x > 0)
        stack.push(index - 1)
      if (x < width - 1)
        stack.push(index + 1)
      if (index >= width)
        stack.push(index - width)
      if (index < width * (height - 1))
        stack.push(index + width)
    }
  }

  const frame = Math.max(3, Math.floor(Math.min(width, height) / 50))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3
      const low = Math.min(data[at]!, data[at + 1]!, data[at + 2]!)
      const high = Math.max(data[at]!, data[at + 1]!, data[at + 2]!)
      const onEdge = x < frame || y < frame || x >= width - frame || y >= height - frame
      const paleNeutral = onEdge && low >= 190 && high - low <= 14
      if (visited[y * width + x] || low >= NEAR_WHITE || paleNeutral) {
        data[at] = 255
        data[at + 1] = 255
        data[at + 2] = 255
      }
    }
  }
}

function toHex(colour: [number, number, number]): string {
  return `#${colour.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Readies an uploaded logo for the card: downsized, flattened, its background settled. */
export async function prepareLogo(source: Buffer): Promise<CardLogo> {
  const { data, info } = await sharp(source)
    .rotate()
    .resize(MAX_SIDE_PX, MAX_SIDE_PX, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const image: Raster = { data: Buffer.from(data), width: info.width, height: info.height }
  const background = backgroundColour(image)
  const white = isNeutralWhite(background)
  if (white)
    whitenBackground(image)

  const png = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 3 } }).png().toBuffer()
  return white ? { kind: 'bare', png } : { kind: 'disc', png, background: toHex(background) }
}
