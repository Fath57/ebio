import type { AppVariant, AppVersions } from './app-version.contract'
import { TypedBody } from '@lonestone/nzoth/server'
import { Controller, Get, Put, Query, UseGuards } from '@nestjs/common'
import { CanManage, CanRead } from '../../common/decorators/check-permissions.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthGuard } from '../auth/auth.guard'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { appVersionsSchema } from './app-version.contract'

/** Where each app is downloaded, by its Android package. */
const STORE_URLS: Record<AppVariant, string> = {
  client: 'https://play.google.com/store/apps/details?id=com.ebio.mobile',
  supplier: 'https://play.google.com/store/apps/details?id=com.ebio.supplier',
  courier: 'https://play.google.com/store/apps/details?id=com.ebio.courier',
}

/**
 * What version an app should be on.
 *
 * Over-the-air updates carry JavaScript and nothing else. The day a release
 * needs a native module, or the API stops accepting what an old build sends,
 * only the store can deliver it — and the app has to be told, because it
 * cannot find out on its own.
 */
@Controller('app-version')
export class AppVersionController {
  constructor(private readonly settings: PlatformSettingsService) {}

  /**
   * Public, and deliberately so: an app too old to sign in is exactly the one
   * that needs to hear this.
   */
  @Public()
  @Get()
  async forApp(@Query('app') app?: string) {
    const versions = await this.settings.getAppVersions()
    const variant: AppVariant = app === 'supplier' || app === 'courier' ? app : 'client'
    return { ...versions[variant], storeUrl: STORE_URLS[variant] }
  }
}

@Controller('admin/app-version')
@UseGuards(AuthGuard, RolesGuard, CaslGuard)
@Roles('ADMIN')
export class AdminAppVersionController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @CanRead('Settings')
  @Get()
  async read() {
    return this.settings.getAppVersions()
  }

  @CanManage('Settings')
  @Put()
  async write(@TypedBody(appVersionsSchema) body: AppVersions) {
    await this.settings.setAppVersions(body)
    return this.settings.getAppVersions()
  }
}
