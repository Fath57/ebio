import { Injectable, Logger } from '@nestjs/common'
import { createTransport, Transporter } from 'nodemailer'
import { config } from '../../config/env.config'
import { EmailTemplateService, TemplateName } from './email-template.service'

export interface EmailOptions {
  to: string
  subject: string
  content: string
  html?: string
}

export interface TemplatedEmailOptions {
  to: string
  subject: string
  template: TemplateName
  data: Record<string, unknown>
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
  }: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: config.email.from,
        to,
        subject,
        text: content,
        html: html || content,
      }

      const info = await this.transporter.sendMail(mailOptions)

      this.logger.log(`Email sent successfully to ${to}: ${info.messageId}`)
    }
    catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error)
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async sendTemplatedEmail({
    to,
    subject,
    template,
    data,
  }: TemplatedEmailOptions): Promise<void> {
    const html = await this.templateService.render(template, data, subject)

    return this.sendEmail({
      to,
      subject,
      content: subject,
      html,
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
