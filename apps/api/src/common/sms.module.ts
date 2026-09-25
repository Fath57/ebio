import { Module } from '@nestjs/common'
import { SmsService } from './sms.service'

/**
 * One SMS service for the whole API.
 *
 * Imported by name rather than declared global: a module that only exists for
 * graphs passing through the root disappears the moment a test builds one
 * module on its own, and the failure names the injected argument, not the
 * missing import.
 *
 * Before this, notifications carried their own copy that logged a line and
 * sent nothing.
 */
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
