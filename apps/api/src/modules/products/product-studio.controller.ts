import type { Response } from 'express'
import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Post, Res, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CanUpdate } from '../../common/decorators/check-permissions.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { Session } from '../auth/auth.decorator'
import { AuthGuard } from '../auth/auth.guard'
import { CaslAbilityFactory } from '../auth/casl/casl-ability.factory'
import { enhancePhotoSchema, restagePhotoSchema, reviewPhotoSchema } from './contracts/photo-studio.contract'
import { describeProductSchema } from './contracts/product-copy.contract'
import { PhotoStudioService } from './photo-studio.service'
import { ProductCopyService } from './product-copy.service'

/**
 * The product studio: the help a shop gets while filling its own catalogue.
 *
 * Open to anyone who may edit a product — a shop owner on their own products,
 * and someone from eBio working on a shop's catalogue. Which of the two it is
 * decides whose photos may be touched, so the ability is resolved here and
 * handed down.
 */
@Controller('products/studio')
@UseGuards(AuthGuard, CaslGuard)
export class ProductStudioController {
  constructor(
    private readonly photoStudio: PhotoStudioService,
    private readonly productCopy: ProductCopyService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  private async managesAnyCatalogue(session: LoggedInBetterAuthSession): Promise<boolean> {
    const ability = await this.caslAbilityFactory.createForUser(session.user as never)
    return ability.can('manage', 'Product')
  }

  /**
   * The retouched photo as bytes, without storing anything.
   *
   * A preview has to be free to throw away: storing every slider move would
   * fill the bucket with pictures nobody chose.
   */
  @Post('photos/preview')
  @CanUpdate('Product')
  async preview(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(enhancePhotoSchema) body: z.infer<typeof enhancePhotoSchema>,
    @Res() res: Response,
  ) {
    const buffer = await this.photoStudio.preview(
      body.url,
      body.adjustments,
      session.user.id,
      await this.managesAnyCatalogue(session),
    )
    res.setHeader('Content-Type', 'image/webp')
    res.setHeader('Cache-Control', 'no-store')
    res.send(buffer)
  }

  /** Keep the retouched photo, alongside the original. */
  @Post('photos/enhance')
  @CanUpdate('Product')
  async enhance(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(enhancePhotoSchema) body: z.infer<typeof enhancePhotoSchema>,
  ) {
    return this.photoStudio.enhance(
      body.url,
      body.adjustments,
      session.user.id,
      await this.managesAnyCatalogue(session),
    )
  }

  /**
   * A description drafted from what the shop already typed.
   *
   * Comes back as a proposal in the form, never written straight to the
   * product: the shop signs what its page says.
   */
  @Post('description')
  @CanUpdate('Product')
  async describe(
    @TypedBody(describeProductSchema) body: z.infer<typeof describeProductSchema>,
  ) {
    return this.productCopy.describe(body)
  }

  /**
   * The deep pass: the product kept, its surroundings redrawn.
   *
   * Always answers with a fidelity verdict alongside the image. A model asked
   * to restage a bottle has been seen inventing a label on it; the screen
   * needs to be able to say so before anyone publishes the result.
   */
  @Post('photos/restage')
  @CanUpdate('Product')
  async restage(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(restagePhotoSchema) body: z.infer<typeof restagePhotoSchema>,
  ) {
    return this.photoStudio.restage(
      body.url,
      body.productName,
      body.consigne,
      session.user.id,
      await this.managesAnyCatalogue(session),
    )
  }

  /** What a buyer would hold against this photo, in words. */
  @Post('photos/review')
  @CanUpdate('Product')
  async review(
    @Session() session: LoggedInBetterAuthSession,
    @TypedBody(reviewPhotoSchema) body: z.infer<typeof reviewPhotoSchema>,
  ) {
    return this.photoStudio.review(
      body.url,
      body.productName,
      session.user.id,
      await this.managesAnyCatalogue(session),
    )
  }
}
