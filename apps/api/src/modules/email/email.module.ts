import { Module } from '@nestjs/common'
import { EmailTemplateService } from './email-template.service'
import { EmailService } from './email.service'

@Module({
  providers: [EmailTemplateService, EmailService],
  exports: [EmailTemplateService, EmailService],
})
export class EmailModule {}
