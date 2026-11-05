import type { CardLogo } from './business-card-logo'
import type { CardContent } from './business-card-renderer'
import type { GenerateBusinessCardsInput } from './business-card.contract'
import { Buffer } from 'node:buffer'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { s3Config } from '../../config/s3.config'
import { Supplier, ValidationStatus } from '../suppliers/supplier.entity'
import { prepareLogo } from './business-card-logo'
import { renderBusinessCards } from './business-card-renderer'
import { cardPlace } from './business-card-text'

/** The host every shop link is verified for by the Android app: not an environment setting. */
const SHOP_URL_BASE = 'https://e-bio.org/boutique'
const LOGO_TIMEOUT_MS = 10_000
const MAX_LOGO_BYTES = 15 * 1024 * 1024
/** Enough to keep a big batch moving without flooding the storage with requests. */
const LOGO_BATCH_SIZE = 6

@Injectable()
export class BusinessCardsService {
  private readonly logger = new Logger(BusinessCardsService.name)

  constructor(private readonly em: EntityManager) {}

  /** The PDF for the requested validated shops; any other shop's QR code would lead nowhere. */
  async generate(input: GenerateBusinessCardsInput): Promise<Buffer> {
    const suppliers = await this.em.find(Supplier, {
      validationStatus: ValidationStatus.VALIDATED,
      ...(input.all ? {} : { id: { $in: input.supplierIds ?? [] } }),
    }, { orderBy: { shopName: 'ASC' } })

    if (suppliers.length === 0)
      throw new BadRequestException('Aucun fournisseur validé dans cette sélection')

    const contents: CardContent[] = []
    for (let start = 0; start < suppliers.length; start += LOGO_BATCH_SIZE) {
      const batch = suppliers.slice(start, start + LOGO_BATCH_SIZE)
      contents.push(...await Promise.all(batch.map(supplier => this.toContent(supplier))))
    }
    return renderBusinessCards(contents)
  }

  private async toContent(supplier: Supplier): Promise<CardContent> {
    return {
      name: supplier.shopName.replace(/\s+/g, ' ').trim(),
      place: cardPlace(supplier.neighborhood, supplier.address),
      url: `${SHOP_URL_BASE}/${supplier.id}`,
      logo: await this.loadLogo(supplier),
    }
  }

  /** A logo that cannot be read must not cost the admin the whole batch: that card shows initials. */
  private async loadLogo(supplier: Supplier): Promise<CardLogo | null> {
    if (!supplier.profilePhoto)
      return null
    // The field accepts any URL from the shop: the server only fetches from our own storage.
    if (!isStorageUrl(supplier.profilePhoto, s3Config.publicUrl)) {
      this.logger.warn(`Logo of ${supplier.id} skipped: not on our storage`)
      return null
    }
    try {
      const response = await fetch(supplier.profilePhoto, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) })
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > MAX_LOGO_BYTES)
        throw new Error(`${bytes.length} bytes`)
      return await prepareLogo(bytes)
    }
    catch (error) {
      this.logger.warn(`Logo of ${supplier.id} unreadable: ${(error as Error).message}`)
      return null
    }
  }
}

export function isStorageUrl(url: string, storageBase: string): boolean {
  try {
    return new URL(url).origin === new URL(storageBase).origin
  }
  catch {
    return false
  }
}
