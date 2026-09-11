import type { LoggedInBetterAuthSession } from '../../config/better-auth.config'
import { EntityManager } from '@mikro-orm/postgresql'
import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import { CanManage } from '../../common/decorators/check-permissions.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { CaslGuard } from '../../common/guards/casl.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Session } from '../auth/auth.decorator'
import { User } from '../auth/auth.entity'
import { AuthGuard } from '../auth/auth.guard'
import { StaffInboxService } from './staff-inbox.service'

@Controller('admin/inbox')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class StaffInboxController {
  constructor(
    private readonly inbox: StaffInboxService,
    private readonly em: EntityManager,
  ) {}

  /** The queues this member can act on; everything else is hidden. */
  @Get()
  async mine(@Session() session: LoggedInBetterAuthSession) {
    const user = await this.em.findOneOrFail(User, { id: session.user.id })
    return { queues: await this.inbox.queuesFor(user) }
  }

  /** Sends the morning digest now (super admin tool, also used to test the mailing). */
  @Post('digest')
  @UseGuards(CaslGuard)
  @CanManage('Staff')
  async sendDigest() {
    return { sent: await this.inbox.sendDailyDigest() }
  }
}
