import { Logger, Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { ChatController } from './chat.controller'
import { ChatGateway } from './chat.gateway'
import { ChatService } from './chat.service'

// TODO: Enable Redis adapter for multi-instance WebSocket support
// import { createAdapter } from '@socket.io/redis-adapter'
// import { createClient } from 'redis'

@Module({
  imports: [NotificationsModule],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {
  private readonly logger = new Logger(ChatModule.name)

  onModuleInit(): void {
    this.logger.log('ChatModule initialized (Redis adapter disabled — single instance mode)')
  }
}
