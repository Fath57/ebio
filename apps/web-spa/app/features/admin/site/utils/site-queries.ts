import { client } from '@boilerstone/openapi-generator'
import {
  landingControllerCreateFaq,
  landingControllerFindAllFaqs,
  landingControllerGetAdminContent,
  landingControllerRemoveFaq,
  landingControllerUpdateFaq,
} from '@boilerstone/openapi-generator/client/sdk.gen'

export interface LandingHero {
  eyebrow: string
  title: string
  highlight: string
  subtitle: string
  footnote: string
}

export interface LandingStores {
  playStoreUrl: string | null
  appStoreUrl: string | null
  comingSoonTitle: string
  comingSoonBody: string
}

export interface LandingTrust {
  points: Array<{ title: string, body: string }>
}

export interface LandingSteps {
  eyebrow: string
  title: string
  steps: Array<{ title: string, body: string }>
}

export interface LandingSupplier {
  eyebrow: string
  title: string
  body: string
  points: string[]
  ctaLabel: string
}

export interface LandingContact {
  recipients: string[]
}

export interface LandingFooter {
  tagline: string
  contactEmail: string
  bottomLine: string
}

export interface LandingContent {
  hero: LandingHero
  stores: LandingStores
  trust: LandingTrust
  steps: LandingSteps
  supplier: LandingSupplier
  footer: LandingFooter
  contact: LandingContact
}

export type LandingSectionKey = keyof LandingContent

export interface LandingFaq {
  id: string
  question: string
  answer: string
  isActive: boolean
  sortOrder: number
}

export function fetchLandingContentQueryOptions() {
  return {
    queryKey: ['admin', 'landing', 'content'],
    queryFn: async () => {
      const response = await landingControllerGetAdminContent()
      if (response.error)
        throw new Error('Failed to fetch landing content')
      return response.data as unknown as LandingContent
    },
  }
}

export function fetchLandingFaqsQueryOptions() {
  return {
    queryKey: ['admin', 'landing', 'faqs'],
    queryFn: async () => {
      const response = await landingControllerFindAllFaqs()
      if (response.error)
        throw new Error('Failed to fetch FAQs')
      return response.data as unknown as LandingFaq[]
    },
  }
}

export async function updateLandingSection(key: LandingSectionKey, value: unknown): Promise<void> {
  // The endpoint validates the body against the schema matching the key, a
  // shape the generated client cannot express: raw call, same cookie auth.
  const response = await client.put({
    url: '/api/landing/content/{key}',
    path: { key },
    body: value,
  })
  if (response.error)
    throw new Error(readError(response.error))
}

export async function createLandingFaq(data: Omit<LandingFaq, 'id'>): Promise<void> {
  const response = await landingControllerCreateFaq({ body: data })
  if (response.error)
    throw new Error(readError(response.error))
}

export async function updateLandingFaq(id: string, data: Partial<Omit<LandingFaq, 'id'>>): Promise<void> {
  const response = await landingControllerUpdateFaq({ path: { id }, body: data })
  if (response.error)
    throw new Error(readError(response.error))
}

export async function deleteLandingFaq(id: string): Promise<void> {
  const response = await landingControllerRemoveFaq({ path: { id } })
  if (response.error)
    throw new Error(readError(response.error))
}

/** The API answers refusals in French; the admin needs to read them. */
function readError(error: unknown): string {
  const message = (error as { message?: unknown })?.message
  return typeof message === 'string' ? message : 'Une erreur est survenue'
}
