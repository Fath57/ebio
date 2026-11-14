import type { CanActivate } from '@nestjs/common'
import { HttpStatus, Injectable } from '@nestjs/common'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { terroirError } from './terroir-texts'

/**
 * Buyer-facing terroir routes answer 403 `TERROIR_DISABLED` while the
 * platform switch is off. Read on each request: closing the module must not
 * wait for a deploy. Back-office and shop routes stay open, to prepare the
 * opening (FR-000).
 */
@Injectable()
export class TerroirEnabledGuard implements CanActivate {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.platformSettings.getTerroirExportEnabled())) {
      throw terroirError(HttpStatus.FORBIDDEN, 'TERROIR_DISABLED', 'La Valise du pays n\'est pas encore ouverte.')
    }
    return true
  }
}
