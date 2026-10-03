import { EnsureRequestContext } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { config } from '../../config/env.config'
import { User } from '../auth/auth.entity'
import { CourierProfile } from '../deliveries/entities/courier-profile.entity'
import { PaymentGatewayFactory } from '../payments/gateways/payment-gateway.factory'
import { PaymentProvider } from '../payments/payment.entity'
import { providerForTransaction } from '../payments/provider-for-transaction'
import { ProviderTransactionKind, ProviderTransactionStatus } from '../provider-transactions/provider-transaction.entity'
import { ProviderTransactionsService } from '../provider-transactions/provider-transactions.service'
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
    private readonly journal: ProviderTransactionsService,
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
    // the user sees anything to pay with. The journal line comes first, so an
    // opening the provider refuses is written down too.
    const operation = await this.journal.open({
      provider: config.payments.checkoutProvider,
      kind: ProviderTransactionKind.TOPUP,
      subjectId: topup.id,
      amount,
    })
    let opened
    try {
      opened = await gateway.initiatePayment({
        amount,
        currency: 'XOF',
        orderId: topup.id,
        paymentMethod: '',
        callbackUrl: config.payments.returnUrl,
      })
    }
    catch (error) {
      await this.failOpening(topup, operation, String((error as Error)?.message ?? error))
      throw new BadRequestException('Le paiement n\'a pas pu être ouvert. Réessayez dans un instant.')
    }
    if (!opened.providerTransactionId) {
      // A topup without a provider reference can never be settled: it would
      // stay « en attente » for good.
      await this.failOpening(topup, operation, 'Aucune référence de transaction rendue')
      throw new BadRequestException('Le paiement n\'a pas pu être ouvert. Réessayez dans un instant.')
    }

    topup.fedapayTransactionId = opened.providerTransactionId
    await this.em.flush()
    await this.journal.attachReference(operation, opened.providerTransactionId)

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
      // Where to verify is read from the transaction, not from the setting: an
      // app installed before the switch still opens its payment with the old
      // provider, and looking for it at the new one would mean failing to
      // credit someone who paid.
      const provider = providerForTransaction(fedapayTransactionId, topup.fedapayTransactionId ?? null)

      let check
      try {
        check = await this.gatewayFactory.createGateway(provider).checkStatus(fedapayTransactionId)
      }
      catch {
        throw new BadRequestException('Transaction introuvable chez le prestataire')
      }
      await this.journal.recordOutcome(fedapayTransactionId, toOutcome(check.status))
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
   * FedaPay's webhook is unsigned, so it only names a transaction: the topup
   * is settled on what FedaPay answers when asked, with the same amount check
   * as `verify`. False when the transaction is not a topup.
   */
  async settleFromWebhook(fedapayTransactionId: string): Promise<boolean> {
    const topup = await this.em.findOne(WalletTopup, { fedapayTransactionId })
    if (!topup) {
      return false
    }
    if (topup.status !== TopupStatus.PENDING) {
      return true
    }

    const check = await this.gatewayFactory.createGateway(PaymentProvider.FEDAPAY).checkStatus(fedapayTransactionId)
    if (check.status === 'completed') {
      if (check.amount !== undefined && check.amount !== Math.round(Number(topup.amount))) {
        this.logger.warn(`Topup ${topup.id}: paid ${check.amount}, expected ${topup.amount}`)
        return true
      }
      await this.settleFromProvider(fedapayTransactionId, 'completed')
    }
    else if (check.status === 'failed' || check.status === 'refunded') {
      await this.settleFromProvider(fedapayTransactionId, 'failed')
    }
    return true
  }

  /**
   * Applies a status already confirmed with the provider. The PENDING →
   * COMPLETED conditional update and the credit commit together: a replayed
   * webhook credits nothing twice, and a credit that fails leaves the topup
   * pending for the next webhook or verification to settle.
   */
  async settleFromProvider(fedapayTransactionId: string, status: 'completed' | 'failed'): Promise<boolean> {
    const topup = await this.em.findOne(WalletTopup, { fedapayTransactionId })
    if (!topup) {
      return false
    }

    const target = status === 'completed' ? TopupStatus.COMPLETED : TopupStatus.FAILED
    // A confirmed payment also lifts a topup we had given up on: the page was
    // abandoned, then paid late, and the money is there. A failure only ever
    // closes a pending one. COMPLETED is never touched, so nothing is credited twice.
    const fromStatuses = status === 'completed' ? `('PENDING', 'FAILED')` : `('PENDING')`
    const isCredited = await this.em.transactional(async (em) => {
      const result = await em.execute<{ affectedRows?: number }>(
        `UPDATE wallet_topups SET status = ?, "updatedAt" = NOW() WHERE id = ? AND status IN ${fromStatuses}`,
        [target, topup.id],
        'run',
      )
      if ((result.affectedRows ?? 0) === 0 || target !== TopupStatus.COMPLETED) {
        return false
      }
      await this.walletService.credit(topup.wallet.id, {
        type: WalletTransactionType.TOPUP,
        amount: Number(topup.amount),
        description: 'Recharge du portefeuille',
      })
      return true
    })

    if (isCredited) {
      this.logger.log(`Topup ${topup.id} credited (${topup.amount} FCFA)`)
    }
    return true
  }

  /**
   * Re-reads every topup still open at the provider and settles it.
   *
   * The app only verifies while its payment screen is open, and the provider
   * sends the buyer back to the same page whether the payment went through or
   * not — usually before the operator has answered. Without this, a topup
   * that failed (or succeeded) a few seconds later stayed « en attente » for
   * good. The webhook would do the same job; it is not relied on.
   */
  @Cron('*/2 * * * *')
  @EnsureRequestContext()
  async reconcilePending(): Promise<void> {
    await this.journalUnrecordedTopups()

    const operations = await this.journal.findToReconcile(ProviderTransactionKind.TOPUP)
    for (const operation of operations) {
      try {
        await this.reconcileOne(operation.reference!, operation.provider)
      }
      catch (error) {
        this.logger.warn(`Rapprochement de la recharge ${operation.subjectId} impossible : ${String((error as Error)?.message ?? error)}`)
      }
    }
  }

  private async reconcileOne(reference: string, provider: string): Promise<void> {
    const check = await this.gatewayFactory.createGateway(provider as PaymentProvider).checkStatus(reference)
    const journalStatus = await this.journal.recordOutcome(reference, toOutcome(check.status))

    if (check.status === 'completed') {
      const topup = await this.em.findOne(WalletTopup, { fedapayTransactionId: reference })
      if (topup && check.amount !== undefined && check.amount !== Math.round(Number(topup.amount))) {
        this.logger.error(`Recharge ${topup.id} : ${check.amount} payés, ${topup.amount} attendus — à régler à la main`)
        return
      }
      await this.settleFromProvider(reference, 'completed')
    }
    else if (check.status === 'failed' || check.status === 'refunded' || journalStatus === ProviderTransactionStatus.ABANDONED) {
      await this.settleFromProvider(reference, 'failed')
    }
  }

  /**
   * Topups opened before the journal existed get their line, so the
   * reconciliation sees them too.
   */
  private async journalUnrecordedTopups(): Promise<void> {
    const rows = await this.em.getConnection().execute<Array<{ id: string, reference: string, amount: string, created: Date }>>(
      `SELECT t.id, t.fedapay_transaction_id AS reference, t.amount, t."createdAt" AS created
       FROM wallet_topups t
       WHERE t.status = 'PENDING' AND t.fedapay_transaction_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM provider_transactions p WHERE p.reference = t.fedapay_transaction_id)`,
    )
    for (const row of rows) {
      const operation = await this.journal.open({
        provider: providerForTransaction(row.reference, null),
        kind: ProviderTransactionKind.TOPUP,
        subjectId: row.id,
        amount: Number(row.amount),
      })
      operation.createdAt = new Date(row.created)
      await this.journal.attachReference(operation, row.reference)
    }
  }

  private async failOpening(topup: WalletTopup, operation: Parameters<ProviderTransactionsService['markFailed']>[0], reason: string): Promise<void> {
    this.logger.error(`Ouverture du paiement refusée pour la recharge ${topup.id} : ${reason}`)
    topup.status = TopupStatus.FAILED
    await this.em.flush()
    await this.journal.markFailed(operation, reason)
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

/** The gateways' vocabulary, folded into the journal's three outcomes. */
function toOutcome(status: string): 'completed' | 'failed' | 'pending' {
  if (status === 'completed') {
    return 'completed'
  }
  return status === 'failed' || status === 'refunded' ? 'failed' : 'pending'
}
