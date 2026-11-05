import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { prepareLogo } from '../business-card-logo'
import { renderBusinessCards } from '../business-card-renderer'
import { isStorageUrl } from '../business-cards.service'

const URL_A = 'https://e-bio.org/boutique/f380b2b8-0211-4c46-b0e0-3ceff8954c4e'

function solid(background: string): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 3, background } }).png().toBuffer()
}

function pageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
}

describe('renderBusinessCards', () => {
  it('produit une page A4 par boutique', async () => {
    const pdf = await renderBusinessCards([
      { name: 'Délice des Rois', place: 'Vedoko, Cotonou', url: URL_A, logo: null },
      { name: 'Kira', place: '', url: URL_A, logo: null },
    ])

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pageCount(pdf)).toBe(2)
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]')
  })

  it('n\'intègre qu\'une fois le logo des huit cartes d\'une planche', async () => {
    const logo = await prepareLogo(await solid('#ffcc00'))
    const pdf = await renderBusinessCards([{ name: 'Sweet', place: '', url: URL_A, logo }])

    expect(pdf.toString('latin1').match(/\/Subtype\s*\/Image/g)?.length).toBe(1)
  })
})

describe('prepareLogo', () => {
  it('pose un logo sur fond blanc directement sur la carte', async () => {
    expect((await prepareLogo(await solid('#fefefe'))).kind).toBe('bare')
  })

  it('met un logo sur fond coloré dans une pastille de cette couleur', async () => {
    const logo = await prepareLogo(await solid('#ffd84d'))
    expect(logo).toMatchObject({ kind: 'disc', background: '#ffd84d' })
  })

  it('blanchit un fond presque blanc sans toucher au dessin', async () => {
    const mark = await sharp({ create: { width: 60, height: 60, channels: 3, background: '#1e7a37' } }).png().toBuffer()
    const source = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#f4f4f2' } })
      .composite([{ input: mark, left: 70, top: 70 }])
      .png()
      .toBuffer()

    const { data } = await sharp((await prepareLogo(source)).png).raw().toBuffer({ resolveWithObject: true })
    const at = (x: number, y: number) => [...data.subarray((y * 200 + x) * 3, (y * 200 + x) * 3 + 3)]

    expect(at(5, 5)).toEqual([255, 255, 255])
    expect(at(100, 100)).toEqual([0x1E, 0x7A, 0x37])
  })
})

describe('isStorageUrl', () => {
  const storage = 'https://ebio-storage.s3.us-east-1.amazonaws.com'

  it('accepte notre stockage et rien d\'autre', () => {
    expect(isStorageUrl(`${storage}/supplier_profile/a.png`, storage)).toBe(true)
    expect(isStorageUrl('https://images.unsplash.com/photo.jpg', storage)).toBe(false)
    expect(isStorageUrl('http://169.254.169.254/latest/meta-data', storage)).toBe(false)
    expect(isStorageUrl('pas une url', storage)).toBe(false)
  })
})
