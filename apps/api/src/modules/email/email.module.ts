import { Module } from '@nestjs/common'
import { EmailTemplateService } from './email-template.service'
import { EmailService } from './email.service'
import { RouteMapService } from './route-map.service'

@Module({
  providers: [EmailTemplateService, EmailService, RouteMapService],
  exports: [EmailTemplateService, EmailService, RouteMapService],
})
export class EmailModule {}
