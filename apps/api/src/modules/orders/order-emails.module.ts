import { Module } from '@nestjs/common'
import { EmailModule } from '../email/email.module'
import { OrderEmailsService } from './order-emails.service'

/** Standalone so orders and payments can both trigger the order e-mails. */
@Module({
  imports: [EmailModule],
  providers: [OrderEmailsService],
  exports: [OrderEmailsService],
})
export class OrderEmailsModule {}
