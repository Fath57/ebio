import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { OrdersModule } from '../orders/orders.module'
import { SearchModule } from '../search/search.module'
import { PlatformSettingsModule } from '../settings/platform-settings.module'
import { AssistantController } from './assistant.controller'
import { AssistantService } from './assistant.service'
import { AssistantSession } from './entities/assistant-session.entity'
import { AssistantTurn } from './entities/assistant-turn.entity'

/**
 * L'assistant ne possède aucune règle commerciale : ses outils sont les
 * services existants. C'est ce qui rend l'ancrage tenable — il ne peut dire
 * que ce que le domaine lui répond.
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
  providers: [AssistantService],
  exports: [AssistantService],
})
export class AssistantModule {}
