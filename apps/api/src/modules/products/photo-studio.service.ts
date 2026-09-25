import type { Media } from '../media/media.entity'
import type { PhotoAdjustments, PhotoFidelity, PhotoReview } from './contracts/photo-studio.contract'
import { Buffer } from 'node:buffer'
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { generateText } from 'ai'
import sharp from 'sharp'
import { config } from '../../config/env.config'
import { getModelInstance } from '../ai/ai.utils'
import { MediaContext } from '../media/media.entity'
import { MediaMapper } from '../media/media.mapper'
import { MediaService } from '../media/media.service'

/** What a marketplace card shows: a square, so a grid of them lines up. */
const CANVAS_SIZE = 1200
const OUTPUT_QUALITY = 85

/** How much uniform border has to surround the subject before trimming it. */
const TRIM_THRESHOLD = 12

/** The square the image editor works in, and answers in. */
const RESTAGE_SIZE = 1024
/** `medium` kept the bottle's shape; `low` turned its cork into a metal cap. */
const RESTAGE_QUALITY = 'medium'
/** Redrawing a scene takes its time; a shorter leash just loses the result. */
const RESTAGE_TIMEOUT_MS = 120_000

/**
 * Retouching a product photo, and saying what is wrong with it.
 *
 * Two deliberately separate things. The retouching is arithmetic on the pixels
 * that were photographed — brightness, framing, a clean backdrop — and invents
 * nothing. The review only *reads* the photo and answers in words. Neither
 * ever produces a picture of a product from a description: a buyer who
 * receives something other than what the listing showed has been misled, and
 * no amount of convenience is worth that.
 */
@Injectable()
export class PhotoStudioService {
  private readonly logger = new Logger(PhotoStudioService.name)

  constructor(private readonly mediaService: MediaService) {}

  /**
   * Resolve a photo URL to the row behind it, and check the caller may touch it.
   *
   * `manageAll` comes from the caller's `manage Product` ability: someone from
   * eBio works on shops' photos, so ownership of the upload cannot be the only
   * key.
   */
  private async resolvePhoto(url: string, userId: string, manageAll: boolean): Promise<Media> {
    const media = await this.mediaService.findByPublicUrl(url)
    if (!media) {
      throw new NotFoundException('Cette photo n\'est pas une photo eBio')
    }
    if (!manageAll && media.uploadedBy?.id !== userId) {
      throw new ForbiddenException('Cette photo ne vous appartient pas')
    }
    return media
  }

  /**
   * Apply the chosen adjustments and store the result as a new photo.
   *
   * A new row, never a replacement: the original stays reachable, so "revenir
   * à l'originale" is a fact and not a promise.
   */
  async enhance(
    url: string,
    adjustments: PhotoAdjustments,
    userId: string,
    manageAll: boolean,
  ): Promise<{ url: string, thumbnailUrl: string | null, mediaId: string }> {
    const media = await this.resolvePhoto(url, userId, manageAll)
    const original = await this.mediaService.readObject(media)
    const enhanced = await this.render(original, adjustments)

    const created = await this.mediaService.createFromBuffer(userId, {
      buffer: enhanced,
      context: MediaContext.PRODUCT_PHOTO,
      originalName: `retouche-${media.originalName.replace(/\.[^.]+$/, '')}.webp`,
      entityType: media.entityType,
      entityId: media.entityId,
    })

    const response = MediaMapper.toResponse(created)
    return {
      mediaId: created.id,
      url: response.publicUrl ?? url,
      thumbnailUrl: response.thumbnailUrl,
    }
  }

  /** The same pipeline the preview uses, so what is shown is what is saved. */
  async preview(
    url: string,
    adjustments: PhotoAdjustments,
    userId: string,
    manageAll: boolean,
  ): Promise<Buffer> {
    const media = await this.resolvePhoto(url, userId, manageAll)
    const original = await this.mediaService.readObject(media)
    return this.render(original, adjustments)
  }

  /**
   * The pixels, and only the pixels.
   *
   * Order matters: straighten before measuring, trim before centring, and
   * light before sharpening — sharpening noise first only makes it louder.
   */
  private async render(input: Buffer, adjustments: PhotoAdjustments): Promise<Buffer> {
    // `failOn: 'none'` keeps a slightly malformed phone JPEG usable; `.rotate()`
    // bakes in the EXIF orientation so the maths below works on what the
    // photographer actually saw.
    let image = sharp(input, { failOn: 'none' }).rotate()

    if (adjustments.trim) {
      // A photo taken on a table often carries a wide dull margin. Trimming it
      // makes the product fill the card instead of floating in it.
      image = image.trim({ threshold: TRIM_THRESHOLD })
    }

    if (adjustments.light) {
      // `normalise` stretches the histogram: the dim, flat look of an indoor
      // phone shot is exactly what it fixes.
      image = image.normalise()
    }

    if (adjustments.warmth !== 0) {
      // A gentle push, expressed as a percentage so the UI can offer a slider
      // that cannot produce a cartoon.
      image = image.modulate({
        brightness: 1 + adjustments.warmth / 200,
        saturation: 1 + adjustments.warmth / 100,
      })
    }

    if (adjustments.sharpen) {
      image = image.sharpen({ sigma: 1 })
    }

    if (adjustments.square) {
      // Contain, not cover: a jar of honey must not lose its lid to a crop.
      // The padding is white because that is what the card's background is.
      image = image.resize(CANVAS_SIZE, CANVAS_SIZE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
    }
    else {
      image = image.resize(CANVAS_SIZE, undefined, { withoutEnlargement: true })
    }

    // Any transparency left over becomes white rather than black, which is
    // what a PNG with an alpha channel turns into otherwise.
    return image
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .webp({ quality: OUTPUT_QUALITY })
      .toBuffer()
  }

  /**
   * What a buyer would hold against this photo.
   *
   * The model is asked to look and report, never to retouch. Its answer is
   * advice for the person holding the phone — which is the only thing that
   * actually fixes a bad product photo.
   */
  async review(url: string, productName: string | undefined, userId: string, manageAll: boolean): Promise<PhotoReview> {
    const media = await this.resolvePhoto(url, userId, manageAll)
    const bytes = await this.mediaService.readObject(media)

    // Sent downscaled: a vision model does not need 1200px to see that a photo
    // is blurry, and the bill is per pixel.
    const probe = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer()

    const subject = productName?.trim()
      ? `Le vendeur annonce : « ${productName.trim()} ».`
      : 'Le nom du produit n\'est pas connu.'

    // The shared `aiService` only carries text messages; an image needs the
    // SDK's message parts. The model instance still comes from the `ai`
    // module's registry, so provider, key, and telemetry stay in one place.
    const model = await getModelInstance(undefined)

    const response = await generateText({
      model,
      // A verdict on a photo is not a reasoning problem, and this one is read
      // by someone waiting in front of a form: at the default effort the same
      // answer cost twenty seconds and ten times the tokens.
      providerOptions: { openai: { reasoningEffort: 'low' } },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Tu juges une photo de produit destinée à une place de marché alimentaire au Bénin.',
              subject,
              'Les vendeurs photographient avec un téléphone, souvent à l\'intérieur. Sois concret et bienveillant.',
              '',
              'Réponds UNIQUEMENT par un objet JSON, sans texte autour :',
              '{"note": 1, "resume": "une phrase", "problemes": [{"code": "FLOU", "conseil": "une phrase d\'action"}]}',
              '',
              '- note : entier de 1 à 5. 5 = publiable telle quelle, 1 = à reprendre.',
              '- problemes : au plus trois, les plus gênants d\'abord, tableau vide si la photo est bonne.',
              '- code : UN SEUL mot, choisi dans cette liste, jamais plusieurs collés :',
              '  FLOU, SOMBRE, FOND, CADRAGE, REFLET, TEXTE, MULTIPLE, HORS_SUJET.',
              '- FOND = arrière-plan encombré. CADRAGE = produit trop petit ou coupé.',
              '  TEXTE = logo ou texte incrusté. MULTIPLE = plusieurs produits différents.',
              '  HORS_SUJET = la photo ne montre pas ce que le nom annonce.',
              '- Écris en français, sans jargon.',
            ].join('\n'),
          },
          { type: 'image', image: probe },
        ],
      }],
    })

    return this.parseReview(response.text)
  }

  /**
   * Rebuild the scene around the product, then check the product survived it.
   *
   * The prompt insists, at length, that the product itself must not change.
   * It is not enough. Asked to restage a bottle carrying **no** label, the
   * editor produced one reading « EXTRA VIRGIN OLIVE OIL » — a commercial
   * claim the shop never made, on a food listing. So the result is never
   * returned alone: it comes with a verdict from a second pass that compares
   * it against the original, and the screen refuses to treat a result judged
   * unfaithful as an ordinary retouch.
   */
  async restage(
    url: string,
    productName: string | undefined,
    consigne: string | undefined,
    userId: string,
    manageAll: boolean,
  ): Promise<{ mediaId: string, url: string, thumbnailUrl: string | null, fidelity: PhotoFidelity }> {
    const apiKey = config.ai.providers.openai.apiKey
    if (!apiKey) {
      throw new BadRequestException('La mise en scène n\'est pas configurée')
    }

    const media = await this.resolvePhoto(url, userId, manageAll)
    const original = await this.mediaService.readObject(media)

    // The editor answers in a square, so it is given one: padding on white
    // rather than cropping, because a crop would throw away part of the
    // product before the model has even seen it.
    const square = await sharp(original, { failOn: 'none' })
      .rotate()
      .resize(RESTAGE_SIZE, RESTAGE_SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer()

    const subject = productName?.trim() ? ` Le produit est : « ${productName.trim()} ».` : ''
    const wish = consigne?.trim() ? ` Ambiance souhaitée : ${consigne.trim()}.` : ''

    const form = new FormData()
    form.append('model', 'gpt-image-1')
    form.append('image', new Blob([new Uint8Array(square)], { type: 'image/png' }), 'produit.png')
    form.append('size', `${RESTAGE_SIZE}x${RESTAGE_SIZE}`)
    form.append('quality', RESTAGE_QUALITY)
    form.append('prompt', [
      'Photo de produit pour une place de marché alimentaire.',
      `Conserve le produit EXACTEMENT tel qu'il est : même forme, même contenant, même bouchon,`,
      'même couleur, même niveau de remplissage, même quantité.',
      'N\'ajoute AUCUNE étiquette, AUCUN texte, AUCUNE marque : s\'il n\'y en a pas, il n\'y en a toujours pas.',
      'Si une étiquette existe, reproduis-la telle quelle sans en changer le texte.',
      'Ne remplace pas le produit par un autre et n\'ajoute aucun objet.',
      'Change uniquement ce qui l\'entoure : fond studio neutre et clair, éclairage doux et régulier,',
      `ombre portée discrète.${subject}${wish}`,
    ].join(' '))

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(RESTAGE_TIMEOUT_MS),
    })

    if (!response.ok) {
      const detail = await response.text()
      this.logger.error(`Restage failed (${response.status}): ${detail.slice(0, 300)}`)
      throw new BadRequestException('La mise en scène n\'a pas abouti')
    }

    const payload = await response.json() as { data?: Array<{ b64_json?: string }> }
    const encoded = payload.data?.[0]?.b64_json
    if (!encoded) {
      throw new BadRequestException('La mise en scène n\'a rien renvoyé')
    }
    const restaged = Buffer.from(encoded, 'base64')

    const fidelity = await this.compare(original, restaged)

    // Stored whatever the verdict says: the screen has to show it side by side
    // for anyone to judge, and a refusal is the person's to make, not ours.
    const created = await this.mediaService.createFromBuffer(userId, {
      buffer: await sharp(restaged).webp({ quality: OUTPUT_QUALITY }).toBuffer(),
      context: MediaContext.PRODUCT_PHOTO,
      // The name carries the fact: a photo redrawn by a model is not a
      // photograph, and whoever opens the bucket later should see that.
      originalName: `mise-en-scene-ia-${media.originalName.replace(/\.[^.]+$/, '')}.webp`,
      entityType: media.entityType,
      entityId: media.entityId,
    })

    const stored = MediaMapper.toResponse(created)
    return {
      mediaId: created.id,
      url: stored.publicUrl ?? url,
      thumbnailUrl: stored.thumbnailUrl,
      fidelity,
    }
  }

  /**
   * Did the product survive the redraw?
   *
   * Background, light and framing are allowed to change — that is the point.
   * What is not allowed is a different product, a different quantity, or text
   * that was not there.
   */
  private async compare(original: Buffer, restaged: Buffer): Promise<PhotoFidelity> {
    const shrink = (input: Buffer) => sharp(input, { failOn: 'none' })
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer()

    const model = await getModelInstance(undefined)
    const response = await generateText({
      model,
      providerOptions: { openai: { reasoningEffort: 'low' } },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'On te donne deux images du MÊME produit : d\'abord la photo d\'origine,',
              'ensuite une version remise en scène.',
              'Ta seule question : la version remise en scène montre-t-elle le même produit,',
              'sans rien ajouter ?',
              '',
              'Réponds UNIQUEMENT par un objet JSON :',
              '{"fidele": true, "ecarts": [{"code": "TEXTE_AJOUTE", "detail": "une phrase"}]}',
              '',
              '- fidele : false dès qu\'un écart est constaté.',
              '- code : UN SEUL mot parmi TEXTE_AJOUTE, ETIQUETTE_MODIFIEE, PRODUIT_DIFFERENT,',
              '  QUANTITE_DIFFERENTE, OBJET_AJOUTE, COULEUR_DIFFERENTE.',
              '- TEXTE_AJOUTE : du texte ou une marque apparaît alors qu\'il n\'y en avait pas.',
              '- Ignore le fond, la lumière et le cadrage : ils ont le droit de changer.',
              '- Écris les détails en français.',
            ].join('\n'),
          },
          { type: 'image', image: await shrink(original) },
          { type: 'image', image: await shrink(restaged) },
        ],
      }],
    })

    return this.parseFidelity(response.text)
  }

  /** A failed check must not pass for a clean bill of health. */
  private parseFidelity(text: string): PhotoFidelity {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) {
      this.logger.warn(`Fidelity check returned no JSON: ${text.slice(0, 200)}`)
      return { fidele: false, ecarts: [{ code: 'INDETERMINE', detail: 'La vérification n\'a pas abouti : comparez vous-même les deux images.' }] }
    }

    let parsed: { fidele?: unknown, ecarts?: unknown }
    try {
      parsed = JSON.parse(text.slice(start, end + 1)) as { fidele?: unknown, ecarts?: unknown }
    }
    catch {
      this.logger.warn(`Fidelity check returned invalid JSON: ${text.slice(0, 200)}`)
      return { fidele: false, ecarts: [{ code: 'INDETERMINE', detail: 'La vérification n\'a pas abouti : comparez vous-même les deux images.' }] }
    }

    const ecarts = Array.isArray(parsed.ecarts)
      ? parsed.ecarts.slice(0, 5).map((item) => {
          const gap = item as { code?: unknown, detail?: unknown }
          return {
            code: typeof gap.code === 'string' ? gap.code : 'AUTRE',
            detail: typeof gap.detail === 'string' ? gap.detail : '',
          }
        }).filter(gap => gap.detail !== '')
      : []

    // Two sources, one answer: a verdict of "faithful" alongside a list of
    // divergences is not a pass.
    return { fidele: parsed.fidele === true && ecarts.length === 0, ecarts }
  }

  /**
   * A model asked for JSON sometimes wraps it in prose or a fence.
   *
   * Rather than fail the screen over a stray backtick, the first balanced
   * object in the answer is taken; only a genuinely unusable answer raises.
   */
  private parseReview(text: string): PhotoReview {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) {
      this.logger.warn(`Photo review returned no JSON: ${text.slice(0, 200)}`)
      throw new BadRequestException('L\'analyse n\'a rien renvoyé d\'exploitable')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    }
    catch {
      this.logger.warn(`Photo review returned invalid JSON: ${text.slice(0, 200)}`)
      throw new BadRequestException('L\'analyse n\'a rien renvoyé d\'exploitable')
    }

    const raw = parsed as { note?: unknown, resume?: unknown, problemes?: unknown }
    const note = Number(raw.note)

    return {
      note: Number.isFinite(note) ? Math.min(5, Math.max(1, Math.round(note))) : 3,
      resume: typeof raw.resume === 'string' ? raw.resume : '',
      problemes: Array.isArray(raw.problemes)
        ? raw.problemes.slice(0, 3).map((item) => {
            const issue = item as { code?: unknown, conseil?: unknown }
            return {
              code: typeof issue.code === 'string' ? issue.code : 'AUTRE',
              conseil: typeof issue.conseil === 'string' ? issue.conseil : '',
            }
          }).filter(issue => issue.conseil !== '')
        : [],
    }
  }
}
