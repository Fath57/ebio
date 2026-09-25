import { Module } from '@nestjs/common'
import { OtpModule } from '../../common/otp.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [OtpModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
