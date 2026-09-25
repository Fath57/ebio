import {
  productStudioControllerDescribe,
  productStudioControllerEnhance,
  productStudioControllerRestage,
  productStudioControllerReview,
} from '@boilerstone/openapi-generator/client/sdk.gen'
import { apiFetch } from '@/lib/api-client'

export interface PhotoAdjustments {
  trim: boolean
  light: boolean
  square: boolean
  sharpen: boolean
  /** Warmth and saturation, in percent, bounded server-side to ±30. */
  warmth: number
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  trim: true,
  light: true,
  square: true,
  sharpen: true,
  warmth: 0,
}

export interface EnhancedPhoto {
  mediaId: string
  url: string
  thumbnailUrl: string | null
}

export interface PhotoIssue {
  code: string
  conseil: string
}

export interface PhotoReview {
  /** 5 = publiable telle quelle, 1 = à reprendre. */
  note: number
  resume: string
  problemes: PhotoIssue[]
}

/**
 * The retouched bytes, stored nowhere.
 *
 * Goes through `apiFetch` rather than the generated SDK: this route answers
 * with an image, and the SDK is built to parse JSON.
 */
export async function previewPhoto(
  url: string,
  adjustments: PhotoAdjustments,
  signal?: AbortSignal,
): Promise<string> {
  const response = await apiFetch('/api/products/studio/photos/preview', {
    method: 'POST',
    body: JSON.stringify({ url, adjustments }),
    signal,
  })
  if (!response.ok)
    throw new Error('Failed to render the preview')
  return URL.createObjectURL(await response.blob())
}

export async function enhancePhoto(url: string, adjustments: PhotoAdjustments): Promise<EnhancedPhoto> {
  const response = await productStudioControllerEnhance({ body: { url, adjustments } })
  if (response.error)
    throw new Error('Failed to enhance the photo')
  return response.data as EnhancedPhoto
}

export async function reviewPhoto(url: string, productName?: string): Promise<PhotoReview> {
  const response = await productStudioControllerReview({
    body: { url, productName: productName ?? '' },
  })
  if (response.error)
    throw new Error('Failed to review the photo')
  return response.data as PhotoReview
}

export interface DescribeProductInput {
  name: string
  categoryName?: string
  unit?: string
  origin?: string
  ingredients?: string
  conservation?: string
  labels?: string[]
  /** An existing description to rework rather than replace outright. */
  current?: string
}

/**
 * A description drafted from what the shop already typed.
 *
 * It comes back as a proposal in the textarea, never written straight to the
 * product: the shop signs what its page says.
 */
export async function describeProduct(input: DescribeProductInput): Promise<string> {
  const response = await productStudioControllerDescribe({
    body: {
      name: input.name,
      categoryName: input.categoryName ?? '',
      unit: input.unit ?? '',
      origin: input.origin ?? '',
      ingredients: input.ingredients ?? '',
      conservation: input.conservation ?? '',
      labels: input.labels ?? [],
      current: input.current ?? '',
    },
  })
  if (response.error)
    throw new Error('Failed to draft the description')
  return (response.data as { description: string }).description
}

export interface PhotoGap {
  code: string
  detail: string
}

export interface RestagedPhoto {
  mediaId: string
  url: string
  thumbnailUrl: string | null
  /** Whether the product itself survived the redraw. */
  fidelity: { fidele: boolean, ecarts: PhotoGap[] }
}

/**
 * The deep pass: the product kept, its surroundings redrawn by a model.
 *
 * Slow — count up to a minute — and never innocent: the answer always carries
 * a fidelity verdict, because the model has been observed adding a label to a
 * bottle that had none.
 */
export async function restagePhoto(
  url: string,
  productName?: string,
  consigne?: string,
): Promise<RestagedPhoto> {
  const response = await productStudioControllerRestage({
    body: { url, productName: productName ?? '', consigne: consigne ?? '' },
  })
  if (response.error)
    throw new Error('Failed to restage the photo')
  return response.data as RestagedPhoto
}
