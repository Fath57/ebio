import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { ProviderTransaction } from './provider-transaction.entity'
import { ProviderTransactionsService } from './provider-transactions.service'

/**
 * Standalone on purpose: wallets and payments both write to the journal, and
 * PaymentsModule already imports WalletModule — living in either one would
 * close the circle.
 */
@Module({
  imports: [MikroOrmModule.forFeature([ProviderTransaction])],
  providers: [ProviderTransactionsService],
  exports: [ProviderTransactionsService],
})
export class ProviderTransactionsModule {}
