import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { config } from '../../config/env.config'
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

  /** Starts the FedaPay checkout; the webhook confirmation credits the wallet. */
  async initiate(userId: string, amount: number): Promise<{ topupId: string, redirectUrl: string }> {
    const wallet = await this.walletService.getOrCreate({ userId })
    const user = await this.em.findOneOrFail(User, { id: userId })

    const topup = this.em.create(WalletTopup, {
      wallet,
      user,
      amount: amount.toFixed(2),
    })
    await this.em.flush()

    let result
    try {
      result = await this.fedapay.initiatePayment({
        orderId: `topup-${topup.id}`,
        amount,
        currency: 'XOF',
        paymentMethod: 'FEDAPAY',
        phoneNumber: user.phone ?? undefined,
        callbackUrl: `${config.api.baseUrl}/api/payments/webhook/fedapay`,
      })
    }
    catch (error) {
      // The pending row must not survive a payment that never started.
      await this.em.removeAndFlush(topup)
      const raw = error as { message?: unknown } | null
      this.logger.error(`Topup initiation failed for user ${userId}: ${String(raw?.message ?? error)}`)
      throw new BadRequestException('Le paiement FedaPay n’a pas pu démarrer. Réessayez dans un instant.')
    }

    topup.fedapayTransactionId = result.providerTransactionId
    if (!result.redirectUrl) {
      throw new Error('FedaPay returned no redirect URL for the topup')
    }
    await this.em.flush()

    return { topupId: topup.id, redirectUrl: result.redirectUrl }
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
