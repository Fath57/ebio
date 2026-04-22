import { join } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import * as ejs from 'ejs'
import { config } from '../../config/env.config'

export type TemplateName
  = 'reset-password'
    | 'verify-email'
    | 'welcome'
    | 'otp-code'

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name)
  private readonly templatesDir = join(__dirname, 'templates')

  async render(
    template: TemplateName,
    data: Record<string, unknown>,
    subject: string,
  ): Promise<string> {
    const bodyHtml = await this.renderFile(
      join(this.templatesDir, `${template}.ejs`),
      data,
    )

    return this.renderFile(
      join(this.templatesDir, 'layout.ejs'),
      { subject, body: bodyHtml, apiBaseUrl: config.api.baseUrl },
    )
  }

  private async renderFile(
    filePath: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    try {
      return await ejs.renderFile(filePath, data, {
        root: this.templatesDir,
      })
    }
    catch (error) {
      this.logger.error(`Failed to render template: ${filePath}`, error)
      throw new Error(
        `Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }
}
