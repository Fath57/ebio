import { Module } from '@nestjs/common'
import { EmailModule } from '../modules/email/email.module'
import { OtpService } from './otp.service'
import { SmsModule } from './sms.module'

/**
 * One-time codes, wherever they are needed.
 *
 * Signing in needs them, and so does changing an address. Imported by name
 * rather than declared global, for the reason the SMS module learnt the hard
 * way: a global module vanishes for any graph that does not pass through the
 * root, which is every test that builds one module on its own.
 */
@Module({
  imports: [SmsModule, EmailModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
