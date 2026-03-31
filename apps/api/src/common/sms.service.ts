import { Injectable, Logger } from '@nestjs/common'
import { config } from '../config/env.config'

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name)

  async send(phone: string, message: string): Promise<void> {
    if (!config.sms.apiKey || config.env === 'development') {
      this.logger.warn(`[SMS-DEV] → ${phone}: ${message}`)
      return
    }

    const url = 'https://api.africastalking.com/version1/messaging'
    const body = new URLSearchParams({
      username: config.sms.username ?? '',
      to: phone,
      message,
      from: config.sms.senderId,
    })

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apiKey': config.sms.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    })

    if (!res.ok) {
      const text = await res.text()
      this.logger.error(`SMS send failed: ${res.status} ${text}`)
      throw new Error('SMS send failed')
    }

    this.logger.debug(`[SMS] → ${phone}: sent`)
  }
}
