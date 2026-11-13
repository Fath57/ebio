import type { CanActivate } from '@nestjs/common'
import { HttpStatus, Injectable } from '@nestjs/common'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { familyError } from './family-texts'

/**
 * Every family wallet route answers 403 `FAMILY_WALLET_DISABLED` while the
 * platform switch is off. Read on each request: closing the module must not
 * wait for a deploy.
 */
@Injectable()
export class FamilyWalletEnabledGuard implements CanActivate {
  constructor(private readonly platformSettings: PlatformSettingsService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.platformSettings.getFamilyWalletEnabled())) {
      throw familyError(HttpStatus.FORBIDDEN, 'FAMILY_WALLET_DISABLED', 'Le portefeuille famille n\'est pas disponible pour le moment.')
    }
    return true
  }
}
