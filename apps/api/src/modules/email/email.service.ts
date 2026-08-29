import type { Buffer } from 'node:buffer'
import { Injectable, Logger } from '@nestjs/common'
import { createTransport, Transporter } from 'nodemailer'
import { config } from '../../config/env.config'
import { EmailTemplateService, TemplateName } from './email-template.service'

/**
 * File attached to an e-mail. Set `cid` to reference the attachment inline
 * from the HTML body (`<img src="cid:...">`), e.g. a map snapshot.
 */
export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType?: string
  cid?: string
}

export interface EmailOptions {
  to: string
  subject: string
  content: string
  html?: string
  /** Address a reply should go to when it differs from the sender. */
  replyTo?: string
  attachments?: EmailAttachment[]
}

export interface TemplatedEmailOptions {
  to: string
  subject: string
  template: TemplateName
  data: Record<string, unknown>
  attachments?: EmailAttachment[]
}

interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  auth?: {
    user: string
    pass: string
  }
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private transporter: Transporter

  constructor(
    private readonly templateService: EmailTemplateService,
  ) {
    const transportConfig: SmtpConfig = {
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
    }

    // Only add auth if user and password are provided
    if (config.email.user && config.email.password) {
      transportConfig.auth = {
        user: config.email.user,
        pass: config.email.password,
      }
    }

    this.transporter = createTransport(transportConfig)
  }

  async sendEmail({
    to,
    subject,
    content,
    html,
    replyTo,
    attachments,
  }: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: config.email.from,
        to,
        subject,
        text: content,
        html: html || content,
        ...(replyTo ? { replyTo } : {}),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      }

      const info = await this.transporter.sendMail(mailOptions)

      this.logger.log(`Email sent successfully to ${to}: ${info.messageId}`)
    }
    catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error)
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /** Renders a branded template without sending, for callers composing the mail themselves. */
  async renderTemplate(template: TemplateName, data: Record<string, unknown>, subject: string): Promise<string> {
    return this.templateService.render(template, data, subject)
  }

  async sendTemplatedEmail({
    to,
    subject,
    template,
    data,
    attachments,
  }: TemplatedEmailOptions): Promise<void> {
    const html = await this.templateService.render(template, data, subject)

    return this.sendEmail({
      to,
      subject,
      content: subject,
      html,
      attachments,
    })
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify()
      this.logger.log('Email service connection verified successfully')
      return true
    }
    catch (error) {
      this.logger.error('Email service connection verification failed:', error)
      return false
    }
  }
}
