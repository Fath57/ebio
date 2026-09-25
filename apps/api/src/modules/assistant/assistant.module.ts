import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { OrdersModule } from '../orders/orders.module'
import { SearchModule } from '../search/search.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { AssistantController } from './assistant.controller'
import { AssistantService } from './assistant.service'
import { AssistantVoiceService } from './assistant.voice'
import { AssistantSession } from './entities/assistant-session.entity'
import { AssistantTurn } from './entities/assistant-turn.entity'

/**
 * The assistant owns no business rules: its tools are the existing services.
 * That is what makes grounding tenable — it can only say what the domain
 * answers.
 */
@Module({
  imports: [
    MikroOrmModule.forFeature([AssistantSession, AssistantTurn]),
    AiModule,
    SearchModule,
    OrdersModule,
    PlatformSettingsModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantVoiceService],
  exports: [AssistantService, AssistantVoiceService],
})
export class AssistantModule {}
