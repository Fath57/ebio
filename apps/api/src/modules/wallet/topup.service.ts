import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { config } from '../../config/env.config'
import { User } from '../auth/auth.entity'
import { CourierProfile } from '../deliveries/entities/courier-profile.entity'
import { PaymentGatewayFactory } from '../payments/gateways/payment-gateway.factory'
import { PaymentProvider } from '../payments/payment.entity'
import { providerForTransaction } from '../payments/provider-for-transaction'
import { Supplier } from '../suppliers/supplier.entity'
import { TopupStatus, WalletTopup } from './entities/wallet-topup.entity'
import { WalletTransactionType } from './entities/wallet-transaction.entity'
import { WalletService } from './wallet.service'

/** Which of the user's wallets a topup lands on. */
export type TopupTarget = 'personal' | 'courier' | 'supplier'

@Injectable()
export class TopupService {
  private readonly logger = new Logger(TopupService.name)

  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
    private readonly gatewayFactory: PaymentGatewayFactory,
  ) {}

  /**
   * The provider behind the widget the apps embed.
   *
   * A top-up is settled by re-reading the transaction the widget produced, so
   * this has to be the same provider the phone just paid through — asking
   * FedaPay about an INTRAM reference finds nothing, and the wallet would
   * never be credited.
   */
  private checkoutGateway() {
    return this.gatewayFactory.createGateway(
      config.payments.checkoutProvider === 'intram' ? PaymentProvider.INTRAM : PaymentProvider.FEDAPAY,
    )
  }

  /**
   * Same pattern as the order checkout: the transaction is created by the
   * provider's widget on the phone; here we only open the pending topup the
   * widget will settle through verify().
   *
   * A courier tops up their courier wallet (to cover the cash-commission
   * debt), never their personal one.
   */
  async initiate(userId: string, amount: number, target: TopupTarget = 'personal'): Promise<{
    topupId: string
    amount: number
    /** The provider's hosted page, when it gives one; the app opens it. */
    paymentUrl: string | null
    /** Known here, so crediting never trusts a reference from the phone. */
    providerTransactionId: string | null
  }> {
    const wallet = await this.walletService.getOrCreate(await this.resolveOwner(userId, target))
    const user = await this.em.findOneOrFail(User, { id: userId })

    const topup = this.em.create(WalletTopup, {
      wallet,
      user,
      amount: amount.toFixed(2),
    })
    await this.em.flush()

    const gateway = this.checkoutGateway()
    // Only for a provider that hands over a page; a widget-based one opens
    // its own transaction on the phone (see `hostsPaymentPage`).
    if (gateway.hostsPaymentPage?.() !== true) {
      return { topupId: topup.id, amount, paymentUrl: null, providerTransactionId: null }
    }

    // The payment is opened here rather than by the phone: the provider's
    // page comes back at once, and the reference it is tied to is ours before
    // the user sees anything to pay with.
    const opened = await gateway.initiatePayment({
      amount,
      currency: 'XOF',
      orderId: topup.id,
      paymentMethod: '',
      callbackUrl: config.payments.returnUrl,
    })

    if (opened.providerTransactionId) {
      topup.fedapayTransactionId = opened.providerTransactionId
      await this.em.flush()
    }

    return {
      topupId: topup.id,
      amount,
      paymentUrl: opened.redirectUrl ?? null,
      providerTransactionId: opened.providerTransactionId ?? null,
    }
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
      // Chez qui vérifier se lit sur la transaction, pas sur le réglage : une
      // application installée avant la bascule ouvre encore son paiement chez
      // l'ancien prestataire, et la chercher chez le nouveau reviendrait à ne
      // pas créditer quelqu'un qui a payé.
      const provider = providerForTransaction(fedapayTransactionId, topup.fedapayTransactionId ?? null)

      let check
      try {
        check = await this.gatewayFactory.createGateway(provider).checkStatus(fedapayTransactionId)
      }
      catch {
        throw new BadRequestException('Transaction introuvable chez le prestataire')
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

    // Anything but a settled topup is an error, not a 200 with a status in
    // the body. Answering 200 for a payment still in flight let every caller
    // read the HTTP code and announce a recharge that had not happened.
    if (fresh.status !== TopupStatus.COMPLETED) {
      // A code, not just a sentence: the app has to tell a payment that
      // failed from one still in flight. Waiting on the first is right;
      // waiting on the second leaves the buyer stuck on a dead page.
      throw new BadRequestException(
        fresh.status === TopupStatus.FAILED
          ? { code: 'payment_failed', message: 'Le paiement a échoué' }
          : { code: 'payment_pending', message: 'Paiement pas encore confirmé' },
      )
    }

    return { status: fresh.status, balance: Number(fresh.wallet.balance) }
  }

  /** `walletId` narrows the list to one of the user's wallets (courier vs personal). */
  async listForUser(userId: string, page: number, limit: number, walletId?: string) {
    const [rows, total] = await this.em.findAndCount(
      WalletTopup,
      { user: { id: userId }, ...(walletId ? { wallet: { id: walletId } } : {}) },
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

  private async resolveOwner(userId: string, target: TopupTarget): Promise<{ userId?: string, courierId?: string, supplierId?: string }> {
    if (target === 'personal') {
      return { userId }
    }
    if (target === 'supplier') {
      const supplier = await this.em.findOne(Supplier, { user: { id: userId } })
      if (!supplier) {
        throw new NotFoundException('Boutique introuvable')
      }
      return { supplierId: supplier.id }
    }
    const profile = await this.em.findOne(CourierProfile, { user: { id: userId } })
    if (!profile) {
      throw new NotFoundException('Profil livreur introuvable')
    }
    return { courierId: profile.id }
  }
}
