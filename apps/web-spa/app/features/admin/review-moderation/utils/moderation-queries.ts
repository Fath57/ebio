import {
  productReviewsControllerListReports,
  productReviewsControllerSetVisibility,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface ReportedReview {
  reportId: string
  reason: string
  reportedAt: string
  review: {
    id: string
    rating: number
    comment: string | null
    authorName: string
    isHidden: boolean
    productId: string
  } | null
}

/** The pending queue. Product reviews only — see the service for why. */
export async function fetchPendingReports(): Promise<ReportedReview[]> {
  const response = await productReviewsControllerListReports()
  if (response.error) {
    throw new Error('Impossible de charger les signalements')
  }
  return ((response.data as { items?: ReportedReview[] })?.items ?? [])
}

/**
 * Hiding pulls the review out of the public lists and out of the product's
 * average; restoring puts it back. Either way the pending reports on it are
 * settled, so the queue shrinks.
 */
export async function setReviewVisibility(reviewId: string, hidden: boolean): Promise<void> {
  const response = await productReviewsControllerSetVisibility({
    path: { id: reviewId },
    body: { hidden },
  })
  if (response.error) {
    throw new Error('La décision n\'a pas pu être enregistrée')
  }
}
