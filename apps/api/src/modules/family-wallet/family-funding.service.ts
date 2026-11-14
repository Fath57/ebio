import type { OnModuleInit } from '@nestjs/common'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common'
import { WalletTransactionType } from '../wallet/entities/wallet-transaction.entity'
import { TopupService } from '../wallet/topup.service'
import { WalletService } from '../wallet/wallet.service'
import { FAMILY_TOPUP_MAX, FAMILY_TOPUP_MIN } from './contracts/family-wallet.contract'
import { FamilyNotifierService } from './family-notifier.service'
import { familyError } from './family-texts'
import { FamilyWalletsService } from './family-wallets.service'

function assertTopupAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < FAMILY_TOPUP_MIN || amount > FAMILY_TOPUP_MAX) {
    throw familyError(
      HttpStatus.BAD_REQUEST,
      'FAMILY_TOPUP_AMOUNT',
      'Une recharge du portefeuille famille va de 1 000 à 500 000 FCFA.',
    )
  }
}

/**
 * Money in: by card or Mobile Money through the ordinary top-up flow, or
 * straight from the payer's personal wallet. Nothing ever goes out to a
 * member (FR-016).
 */
@Injectable()
export class FamilyFundingService implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly wallets: FamilyWalletsService,
    private readonly walletService: WalletService,
    private readonly topups: TopupService,
    private readonly notifier: FamilyNotifierService,
  ) {}

  /** Whatever settles a top-up, the app, the webhook, the cron, the members hear of it. */
  onModuleInit(): void {
    this.topups.onCredited(topup => this.notifier.onTopupCredited(topup.walletId))
  }

  /**
   * Opens a card or Mobile Money top-up of the payer's family wallet. The
   * same flow as the personal wallet's: credited once, on the provider's
   * confirmation only (FR-009).
   */
  async initiateTopup(payerId: string, amount: number): ReturnType<TopupService['initiate']> {
    assertTopupAmount(amount)
    await this.wallets.findOpenByPayer(payerId)
    return this.topups.initiate(payerId, amount, 'family')
  }

  async verifyTopup(payerId: string, topupId: string, providerTransactionId: string): ReturnType<TopupService['verify']> {
    await this.wallets.findByPayer(payerId)
    return this.topups.verify(payerId, topupId, providerTransactionId)
  }

  /**
   * From the payer's personal wallet to their family wallet, at once: the
   * debit and the credit commit together, or neither does.
   */
  async transferFromPersonal(payerId: string, amount: number): Promise<{ balance: number, personalBalance: number }> {
    assertTopupAmount(amount)
    const familyWallet = await this.wallets.findOpenByPayer(payerId)
    const personal = await this.walletService.getOrCreate({ userId: payerId })
    const family = await this.wallets.balanceWallet(familyWallet.id)

    let balances: { balance: number, personalBalance: number }
    try {
      balances = await this.em.transactional(async () => {
        const personalBalance = await this.walletService.debit(personal.id, {
          type: WalletTransactionType.FAMILY_TRANSFER_OUT,
          amount,
          description: 'Virement vers le portefeuille famille',
        })
        const balance = await this.walletService.credit(family.id, {
          type: WalletTransactionType.FAMILY_TRANSFER_IN,
          amount,
          description: 'Virement depuis le portefeuille personnel',
        })
        return { balance, personalBalance }
      })
    }
    catch (error) {
      if (error instanceof BadRequestException && error.message === 'Solde insuffisant') {
        throw familyError(
          HttpStatus.BAD_REQUEST,
          'INSUFFICIENT_BALANCE',
          'Votre portefeuille eBio ne suffit pas pour ce virement.',
        )
      }
      throw error
    }

    await this.notifier.onTopupCredited(family.id)
    return balances
  }
}
