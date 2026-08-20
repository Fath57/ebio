import type { ContactMessage, CreateLandingFaq, LandingFaqResponse, LandingSectionKey, UpdateLandingFaq } from './contracts/landing.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { EmailService } from '../email/email.service'
import { CONTACT_REASON_LABELS } from './contracts/landing.contract'
import { LandingContent } from './entities/landing-content.entity'
import { LandingFaq } from './entities/landing-faq.entity'

/** A form filled faster than this was filled by a script, not a person. */
const MIN_FILL_TIME_MS = 3_000

/** Per-sender ceiling on contact messages: 3 within a 10 minute window. */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 3

@Injectable()
export class LandingService {
  constructor(
    private readonly em: EntityManager,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Everything the public landing needs in one round trip: the sections plus
   * the active questions. Missing sections are simply absent from the map; the
   * landing keeps its built-in defaults for them.
   */
  async getPublicContent(): Promise<Record<string, unknown>> {
    const [sections, faqs] = await Promise.all([
      this.em.find(LandingContent, {}),
      this.em.find(LandingFaq, { isActive: true }, { orderBy: { sortOrder: 'ASC', createdAt: 'ASC' } }),
    ])

    const content: Record<string, unknown> = {}
    for (const section of sections) {
      // The contact recipients stay server-side; publishing them would hand
      // the addresses to every scraper reading this endpoint.
      if (section.key !== 'contact') {
        content[section.key] = section.value
      }
    }
    content.faq = faqs.map(faq => ({ question: faq.question, answer: faq.answer }))
    return content
  }

  /** Every section, contact included: for the backoffice only. */
  async getAdminContent(): Promise<Record<string, unknown>> {
    const sections = await this.em.find(LandingContent, {})
    const content: Record<string, unknown> = {}
    for (const section of sections) {
      content[section.key] = section.value
    }
    return content
  }

  /** Timestamps of recent submissions, per sender key. Single-instance state. */
  private readonly contactSubmissions = new Map<string, number[]>()

  /** Forwards a landing contact message to the configured recipients. */
  async sendContactMessage(data: ContactMessage, senderKey: string): Promise<void> {
    this.assertNotRobot(data)
    this.assertUnderRateLimit(senderKey)

    const section = await this.em.findOne(LandingContent, { key: 'contact' })
    const recipients = (section?.value as { recipients?: string[] } | null)?.recipients ?? []
    if (recipients.length === 0) {
      throw new ServiceUnavailableException('Le formulaire de contact n’est pas configuré')
    }

    const reasonLabel = CONTACT_REASON_LABELS[data.reason]
    const content = [
      'Message reçu depuis e-bio.org',
      '',
      `Nom : ${data.name}`,
      `Email : ${data.email}`,
      data.phone ? `Téléphone : ${data.phone}` : null,
      `Motif : ${reasonLabel}`,
      '',
      data.message,
    ].filter(line => line !== null).join('\n')

    const html = await this.emailService.renderTemplate('contact-message', {
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      reasonLabel,
      message: data.message,
    }, `[eBio] ${reasonLabel} · ${data.name}`)

    await this.emailService.sendEmail({
      to: recipients.join(', '),
      subject: `[eBio] ${reasonLabel} · ${data.name}`,
      content,
      html,
      replyTo: data.email,
    })
  }

  /**
   * The two silent checks: the honeypot is validated by the schema already,
   * the fill time is checked here. Both answer with a generic 400 so a bot
   * author learns nothing from the response.
   */
  private assertNotRobot(data: ContactMessage): void {
    const elapsed = Date.now() - data.startedAt
    if (elapsed < MIN_FILL_TIME_MS || elapsed < 0) {
      throw new BadRequestException('Envoi invalide')
    }
  }

  private assertUnderRateLimit(senderKey: string): void {
    const now = Date.now()
    const recent = (this.contactSubmissions.get(senderKey) ?? [])
      .filter(at => now - at < RATE_LIMIT_WINDOW_MS)
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpException('Trop de messages envoyés, réessayez plus tard', HttpStatus.TOO_MANY_REQUESTS)
    }
    recent.push(now)
    this.contactSubmissions.set(senderKey, recent)
  }

  async updateSection(key: LandingSectionKey, value: Record<string, unknown>): Promise<void> {
    const existing = await this.em.findOne(LandingContent, { key })
    if (existing) {
      existing.value = value
    }
    else {
      this.em.create(LandingContent, { key, value })
    }
    await this.em.flush()
  }

  // --- FAQ management ---

  async findAllFaqs(): Promise<LandingFaqResponse[]> {
    const faqs = await this.em.find(LandingFaq, {}, { orderBy: { sortOrder: 'ASC', createdAt: 'ASC' } })
    return faqs.map(faq => this.toFaqResponse(faq))
  }

  async createFaq(data: CreateLandingFaq): Promise<LandingFaqResponse> {
    const faq = this.em.create(LandingFaq, {
      question: data.question,
      answer: data.answer,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    })
    await this.em.flush()
    return this.toFaqResponse(faq)
  }

  async updateFaq(id: string, data: UpdateLandingFaq): Promise<LandingFaqResponse> {
    const faq = await this.em.findOne(LandingFaq, { id })
    if (!faq) {
      throw new NotFoundException('Question introuvable')
    }
    if (data.question !== undefined)
      faq.question = data.question
    if (data.answer !== undefined)
      faq.answer = data.answer
    if (data.isActive !== undefined)
      faq.isActive = data.isActive
    if (data.sortOrder !== undefined)
      faq.sortOrder = data.sortOrder
    await this.em.flush()
    return this.toFaqResponse(faq)
  }

  async removeFaq(id: string): Promise<void> {
    const faq = await this.em.findOne(LandingFaq, { id })
    if (!faq) {
      throw new NotFoundException('Question introuvable')
    }
    await this.em.removeAndFlush(faq)
  }

  private toFaqResponse(faq: LandingFaq): LandingFaqResponse {
    return {
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      isActive: faq.isActive,
      sortOrder: faq.sortOrder,
    }
  }
}
