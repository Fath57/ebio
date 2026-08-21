import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { FedaPayGateway } from '../payments/gateways/fedapay.gateway'
import { TopupStatus, WalletTopup } from './entities/wallet-topup.entity'
import { WalletTransactionType } from './entities/wallet-transaction.entity'
import { WalletService } from './wallet.service'

@Injectable()
export class TopupService {
  private readonly logger = new Logger(TopupService.name)
  private readonly fedapay = new FedaPayGateway()

  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Same pattern as the order checkout: the FedaPay transaction is created
   * by the Checkout.js widget on the phone; here we only open the pending
   * topup the widget will settle through verify().
   */
  async initiate(userId: string, amount: number): Promise<{ topupId: string, amount: number }> {
    const wallet = await this.walletService.getOrCreate({ userId })
    const user = await this.em.findOneOrFail(User, { id: userId })

    const topup = this.em.create(WalletTopup, {
      wallet,
      user,
      amount: amount.toFixed(2),
    })
    await this.em.flush()

    return { topupId: topup.id, amount }
  }

  /**
   * Called by the app when the widget completes. The server re-checks the
   * transaction with FedaPay and compares the paid amount to the topup —
   * the client's word is never enough to credit a wallet.
   */
  async verify(userId: string, topupId: string, fedapayTransactionId: string): Promise<{ status: string, balance: number }> {
    const topup = await this.em.findOne(WalletTopup, { id: topupId, user: { id: userId } })
    if (!topup) {
      throw new BadRequestException('Recharge introuvable')
    }

    if (topup.status === TopupStatus.PENDING) {
      let check
      try {
        check = await this.fedapay.checkStatus(fedapayTransactionId)
      }
      catch {
        throw new BadRequestException('Transaction FedaPay introuvable')
      }
      if (check.status === 'completed') {
        if (check.amount !== undefined && check.amount !== Math.round(Number(topup.amount))) {
          this.logger.warn(`Topup ${topupId}: paid ${check.amount}, expected ${topup.amount}`)
          throw new BadRequestException('Le montant payé ne correspond pas à la recharge')
        }
        topup.fedapayTransactionId = fedapayTransactionId
        await this.em.flush()
        await this.settleFromProvider(fedapayTransactionId, 'completed')
      }
      else if (check.status === 'failed' || check.status === 'refunded') {
        topup.fedapayTransactionId = fedapayTransactionId
        await this.em.flush()
        await this.settleFromProvider(fedapayTransactionId, 'failed')
      }
    }

    this.em.clear()
    const fresh = await this.em.findOneOrFail(WalletTopup, { id: topupId }, { populate: ['wallet'] })
    return { status: fresh.status, balance: Number(fresh.wallet.balance) }
  }

  async listForUser(userId: string, page: number, limit: number) {
    const [rows, total] = await this.em.findAndCount(
      WalletTopup,
      { user: { id: userId } },
      { orderBy: { createdAt: 'DESC' }, limit, offset: (page - 1) * limit },
    )
    return {
      items: rows.map(topup => ({
        id: topup.id,
        amount: Number(topup.amount),
        status: topup.status,
        createdAt: topup.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    }
  }

  async adminList(status: string | undefined, page: number, limit: number) {
    const where = status ? { status: status as TopupStatus } : {}
    const [rows, total] = await this.em.findAndCount(WalletTopup, where, {
      populate: ['user'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset: (page - 1) * limit,
    })
    return {
      items: rows.map(topup => ({
        id: topup.id,
        amount: Number(topup.amount),
        status: topup.status,
        createdAt: topup.createdAt.toISOString(),
        userName: topup.user.name ?? '',
        userEmail: topup.user.email ?? null,
        fedapayTransactionId: topup.fedapayTransactionId ?? null,
      })),
      total,
      page,
      limit,
    }
  }

  /**
   * Called by the FedaPay webhook when the transaction is not an order
   * payment. Idempotent: the PENDING → COMPLETED conditional update is the
   * arbiter, a replayed webhook credits nothing twice.
   */
  async settleFromProvider(fedapayTransactionId: string, status: 'completed' | 'failed'): Promise<boolean> {
    const topup = await this.em.findOne(WalletTopup, { fedapayTransactionId })
    if (!topup) {
      return false
    }

    const target = status === 'completed' ? TopupStatus.COMPLETED : TopupStatus.FAILED
    const result = await this.em.getConnection().execute<{ affectedRows?: number }>(
      `UPDATE wallet_topups SET status = ?, "updatedAt" = NOW() WHERE id = ? AND status = 'PENDING'`,
      [target, topup.id],
      'run',
    )
    if ((result.affectedRows ?? 0) === 0) {
      return true
    }

    if (target === TopupStatus.COMPLETED) {
      await this.walletService.credit(topup.wallet.id, {
        type: WalletTransactionType.TOPUP,
        amount: Number(topup.amount),
        description: 'Recharge du portefeuille',
      })
      this.logger.log(`Topup ${topup.id} credited (${topup.amount} FCFA)`)
    }
    return true
  }
}
