import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Global, Module } from '@nestjs/common'
import { AuditService } from './audit.service'
import { AuditLog } from './entities/audit-log.entity'

/** Global so any module can journal a staff action without wiring. */
@Global()
@Module({
  imports: [MikroOrmModule.forFeature([AuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
