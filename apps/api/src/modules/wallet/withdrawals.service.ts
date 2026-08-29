import type { User } from '../auth/auth.entity'
import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CourierProfile } from '../deliveries/entities/courier-profile.entity'
import { NotificationChannel, NotificationType } from '../notifications/notification.entity'
import { NotificationsService } from '../notifications/notifications.service'
import { FedaPayGateway } from '../payments/gateways/fedapay.gateway'
import { Supplier } from '../suppliers/supplier.entity'
import { PayoutNumber, PayoutNumberStatus } from './entities/payout-number.entity'
import { WalletTransactionType } from './entities/wallet-transaction.entity'
import { WithdrawalRequest, WithdrawalStatus } from './entities/withdrawal-request.entity'
import { detectOperator, normalizeBeninPhone, OPERATOR_LABELS } from './operator.util'
import { WalletService } from './wallet.service'

export const WITHDRAWAL_MIN_AMOUNT = 1000

/** A payout silent for this long is re-checked against FedaPay directly. */
const STALE_PROCESSING_MS = 10 * 60 * 1000

/** Who owns the payout numbers and withdrawals: a shop or a courier, never both. */
export interface PayoutOwner {
  supplierId?: string
  courierId?: string
}

export type PayoutOwnerType = 'SUPPLIER' | 'COURIER'

/** The person behind a payout number / withdrawal, whatever the owner type. */
interface Payee {
  user: User
  displayName: string
  ownerType: PayoutOwnerType
}

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name)
  private readonly fedapay = new FedaPayGateway()

  constructor(
    private readonly em: EntityManager,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------- Payout numbers ----------

  async listNumbers(owner: PayoutOwner) {
    const numbers = await this.em.find(PayoutNumber, this.ownerWhere(owner), {
      orderBy: { createdAt: 'DESC' },
    })
    return { items: numbers.map(n => this.mapNumber(n)) }
  }

  async addNumber(owner: PayoutOwner, input: { phoneNumber: string, holderName: string }) {
    const phoneNumber = normalizeBeninPhone(input.phoneNumber)
    const operator = detectOperator(phoneNumber)
    if (!operator) {
      throw new BadRequestException(
        'Numéro non reconnu : il doit être un numéro Mobile Money béninois à 10 chiffres (MTN, Moov ou Celtiis)',
      )
    }

    const existing = await this.em.findOne(PayoutNumber, {
      ...this.ownerWhere(owner),
      phoneNumber,
    })
    if (existing) {
      throw new BadRequestException('Ce numéro est déjà enregistré')
    }

    const number = this.em.create(PayoutNumber, {
      ...this.ownerRefs(owner),
      phoneNumber,
      operator,
      holderName: input.holderName,
    })
    await this.em.flush()
    return this.mapNumber(number)
  }

  async removeNumber(owner: PayoutOwner, numberId: string): Promise<void> {
    const number = await this.em.findOne(PayoutNumber, { id: numberId, ...this.ownerWhere(owner) })
    if (!number) {
      throw new NotFoundException('Numéro introuvable')
    }
    const activeWithdrawal = await this.em.findOne(WithdrawalRequest, {
      payoutNumber: { id: numberId },
      status: { $in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] },
    })
    if (activeWithdrawal) {
      throw new BadRequestException('Une demande de reversement utilise encore ce numéro')
    }
    await this.em.removeAndFlush(number)
  }

  // ---------- Withdrawals (owner side) ----------

  async listWithdrawals(owner: PayoutOwner, page: number, limit: number) {
    const [rows, total] = await this.em.findAndCount(
      WithdrawalRequest,
      this.ownerWhere(owner),
      { populate: ['payoutNumber'], orderBy: { createdAt: 'DESC' }, limit, offset: (page - 1) * limit },
    )
    return { items: rows.map(w => this.mapWithdrawal(w)), total, page, limit }
  }

  /** Debits the wallet at once: the money is reserved, not promised. */
  async requestWithdrawal(owner: PayoutOwner, input: { payoutNumberId: string, amount: number }) {
    if (input.amount < WITHDRAWAL_MIN_AMOUNT) {
      throw new BadRequestException(`Le montant minimum est de ${WITHDRAWAL_MIN_AMOUNT} FCFA`)
    }

    const number = await this.em.findOne(PayoutNumber, {
      id: input.payoutNumberId,
      ...this.ownerWhere(owner),
      status: PayoutNumberStatus.VALIDATED,
    })
    if (!number) {
      throw new BadRequestException('Ce numéro n’est pas validé pour les reversements')
    }

    const active = await this.em.findOne(WithdrawalRequest, {
      ...this.ownerWhere(owner),
      status: { $in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] },
    })
    if (active) {
      throw new BadRequestException('Une demande est déjà en cours de traitement')
    }

    const wallet = await this.walletService.getOrCreate(owner)

    const withdrawal = this.em.create(WithdrawalRequest, {
      ...this.ownerRefs(owner),
      wallet,
      payoutNumber: number,
      amount: input.amount.toFixed(2),
    })
    await this.em.flush()

    try {
      await this.walletService.debit(wallet.id, {
        type: WalletTransactionType.WITHDRAWAL,
        amount: input.amount,
        description: `Demande de reversement vers ${number.phoneNumber}`,
        withdrawalId: withdrawal.id,
      })
    }
    catch (error) {
      // Insufficient balance (or a concurrent debit won): drop the request.
      await this.em.removeAndFlush(withdrawal)
      throw error
    }

    return this.mapWithdrawal(withdrawal)
  }

  async cancelWithdrawal(owner: PayoutOwner, withdrawalId: string) {
    const reserved = await this.reserve(withdrawalId, WithdrawalStatus.PENDING, WithdrawalStatus.CANCELLED, {
      owner,
    })
    await this.refund(reserved, 'Annulation de la demande de reversement')
    return this.mapWithdrawal(reserved)
  }

  // ---------- Admin side ----------

  async adminList(status: string | undefined, page: number, limit: number) {
    const where = status ? { status: status as WithdrawalStatus } : {}
    const [rows, total] = await this.em.findAndCount(WithdrawalRequest, where, {
      populate: ['payoutNumber', 'supplier', 'courier'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset: (page - 1) * limit,
    })
    return {
      items: rows.map(w => ({
        ...this.mapWithdrawal(w),
        ...this.mapOwner(w),
        holderName: w.payoutNumber.holderName,
      })),
      total,
      page,
      limit,
    }
  }

  /**
   * Approval = atomic reservation (lesson from the POS project): the
   * PENDING → PROCESSING transition is a conditional UPDATE touching exactly
   * one row. Two concurrent approvals: the first wins, the second neither
   * debits nor pays — the wallet was already debited at request time, so
   * approval only fires the payout.
   */
  async approve(withdrawalId: string, adminId: string) {
    const withdrawal = await this.reserve(withdrawalId, WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING, {
      processedBy: adminId,
    })

    const payee = await this.resolvePayee(withdrawal)
    const number = withdrawal.payoutNumber

    try {
      const [firstname, ...rest] = (number.holderName || payee.displayName).split(' ')
      const result = await this.fedapay.createPayout({
        amount: Math.round(Number(withdrawal.amount)),
        phoneNumber: number.phoneNumber,
        mode: number.operator,
        firstname,
        lastname: rest.join(' ') || firstname,
        email: payee.user.email ?? undefined,
        withdrawalId: withdrawal.id,
      })
      withdrawal.fedapayPayoutId = result.payoutId
      withdrawal.providerReference = result.reference
      await this.em.flush()
    }
    catch (error) {
      // The payout never left: fail the request and give the money back.
      // Never JSON.stringify here: provider errors carry circular refs. The
      // FedaPay SDK throws plain objects whose useful part sits in .message
      // or .errorMessage.
      const raw = error as { message?: unknown, errorMessage?: unknown } | null
      const detail = String(raw?.message ?? raw?.errorMessage ?? error)
      this.logger.error(`FedaPay payout failed for withdrawal ${withdrawal.id}: ${detail}`)
      withdrawal.status = WithdrawalStatus.FAILED
      withdrawal.processedAt = new Date()
      await this.em.flush()
      await this.refund(withdrawal, 'Échec du versement — solde rétabli')
      throw new BadRequestException('Le versement FedaPay a échoué ; le solde du bénéficiaire est rétabli')
    }

    return this.mapWithdrawal(withdrawal)
  }

  async reject(withdrawalId: string, adminId: string, reason: string) {
    const withdrawal = await this.reserve(withdrawalId, WithdrawalStatus.PENDING, WithdrawalStatus.REJECTED, {
      processedBy: adminId,
      rejectionReason: reason,
    })
    await this.refund(withdrawal, `Demande refusée : ${reason}`)
    await this.notifyOwner(withdrawal, 'Reversement refusé', `Votre demande de reversement a été refusée : ${reason}. Votre solde est rétabli.`)
    return this.mapWithdrawal(withdrawal)
  }

  async adminListNumbers(status: string | undefined, page: number, limit: number) {
    const where = status ? { status: status as PayoutNumberStatus } : {}
    const [rows, total] = await this.em.findAndCount(PayoutNumber, where, {
      populate: ['supplier', 'courier'],
      orderBy: { createdAt: 'DESC' },
      limit,
      offset: (page - 1) * limit,
    })
    return {
      items: rows.map(n => ({
        ...this.mapNumber(n),
        ...this.mapOwner(n),
      })),
      total,
      page,
      limit,
    }
  }

  async adminActOnNumber(numberId: string, adminId: string, action: 'validate' | 'reject', reason?: string) {
    const number = await this.em.findOne(PayoutNumber, { id: numberId }, {
      populate: ['supplier', 'supplier.user', 'courier', 'courier.user'],
    })
    if (!number) {
      throw new NotFoundException('Numéro introuvable')
    }
    if (number.status !== PayoutNumberStatus.PENDING) {
      throw new BadRequestException('Ce numéro a déjà été traité')
    }

    if (action === 'validate') {
      number.status = PayoutNumberStatus.VALIDATED
    }
    else {
      if (!reason) {
        throw new BadRequestException('Un motif de refus est requis')
      }
      number.status = PayoutNumberStatus.REJECTED
      number.rejectionReason = reason
    }
    number.validatedBy = adminId
    number.validatedAt = new Date()
    await this.em.flush()

    const payee = await this.resolvePayee(number)
    await this.notificationsService.send({
      user: payee.user,
      type: this.payoutNotificationType(payee.ownerType),
      title: action === 'validate' ? 'Numéro de reversement validé' : 'Numéro de reversement refusé',
      body: action === 'validate'
        ? `Le numéro ${number.phoneNumber} est validé. Vous pouvez demander vos reversements.`
        : `Le numéro ${number.phoneNumber} a été refusé : ${reason}`,
      data: { payoutNumberId: number.id },
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    }).catch(() => this.logger.warn(`Notification failed for payout number ${number.id}`))

    return this.mapNumber(number)
  }

  /** Balances overview for the BO: who eBio owes, and who owes eBio (cash debt). */
  async adminWalletsOverview() {
    const rows = await this.em.getConnection().execute(
      `SELECT w.id, w.balance, w."updatedAt",
              s.id AS supplier_id, s.shop_name,
              cp.id AS courier_id, cp.full_name AS courier_name,
              u.id AS user_id, u.name AS user_name
       FROM wallets w
       LEFT JOIN suppliers s ON s.id = w.supplier_id
       LEFT JOIN courier_profiles cp ON cp.id = w.courier_profile_id
       LEFT JOIN users u ON u.id = w.user_id
       ORDER BY w.balance DESC`,
    )
    const wallets = rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      balance: Number(r.balance),
      ownerType: r.supplier_id ? 'SUPPLIER' : r.courier_id ? 'COURIER' : 'USER',
      ownerName: (r.shop_name ?? r.courier_name ?? r.user_name ?? '') as string,
      supplierId: (r.supplier_id as string) ?? null,
      courierId: (r.courier_id as string) ?? null,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
    }))
    return {
      wallets,
      totalOwed: wallets.filter((w: { balance: number }) => w.balance > 0)
        .reduce((sum: number, w: { balance: number }) => sum + w.balance, 0),
      totalDebt: wallets.filter((w: { balance: number }) => w.balance < 0)
        .reduce((sum: number, w: { balance: number }) => sum + Math.abs(w.balance), 0),
    }
  }

  // ---------- Payout completion (webhook + polling) ----------

  /** Called by the FedaPay webhook on payout.* events, and by the poller. */
  async settleFromProvider(fedapayPayoutId: string): Promise<void> {
    const withdrawal = await this.em.findOne(WithdrawalRequest, {
      fedapayPayoutId,
      status: WithdrawalStatus.PROCESSING,
    }, { populate: ['payoutNumber', 'supplier', 'supplier.user', 'courier', 'courier.user'] })
    if (!withdrawal) {
      return
    }

    const check = await this.fedapay.checkPayoutStatus(fedapayPayoutId)
    if (check.status === 'pending') {
      return
    }

    // Same reservation discipline: webhook and poller may race.
    const target = check.status === 'sent' ? WithdrawalStatus.PAID : WithdrawalStatus.FAILED
    try {
      await this.reserve(withdrawal.id, WithdrawalStatus.PROCESSING, target, {
        providerReference: check.reference,
      })
    }
    catch {
      return
    }

    if (target === WithdrawalStatus.PAID) {
      await this.notifyOwner(withdrawal, 'Reversement effectué', `${Number(withdrawal.amount)} FCFA ont été envoyés au ${withdrawal.payoutNumber.phoneNumber}.`)
    }
    else {
      this.logger.error(`Payout ${fedapayPayoutId} failed: ${check.errorMessage}`)
      await this.refund(withdrawal, 'Échec du versement — solde rétabli')
      await this.notifyOwner(withdrawal, 'Reversement échoué', 'Le versement a échoué. Votre solde est rétabli, vous pouvez refaire une demande.')
    }
  }

  /** Safety net when the webhook never lands. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async pollStaleProcessing(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_PROCESSING_MS)
    const stale = await this.em.find(WithdrawalRequest, {
      status: WithdrawalStatus.PROCESSING,
      fedapayPayoutId: { $ne: null },
      processedAt: { $lt: cutoff },
    })
    for (const withdrawal of stale) {
      try {
        await this.settleFromProvider(withdrawal.fedapayPayoutId!)
      }
      catch (error) {
        this.logger.error(`Polling failed for withdrawal ${withdrawal.id}`, error)
      }
    }
  }

  // ---------- Internals ----------

  /**
   * Conditional UPDATE as the arbiter: exactly one caller wins the
   * from → to transition; everyone else gets a 400.
   */
  private async reserve(
    withdrawalId: string,
    from: WithdrawalStatus,
    to: WithdrawalStatus,
    extra: { owner?: PayoutOwner, processedBy?: string, rejectionReason?: string, providerReference?: string | null } = {},
  ): Promise<WithdrawalRequest> {
    const conditions = ['id = ?', 'status = ?']
    const params: unknown[] = [withdrawalId, from]
    if (extra.owner?.supplierId) {
      conditions.push('supplier_id = ?')
      params.push(extra.owner.supplierId)
    }
    else if (extra.owner?.courierId) {
      conditions.push('courier_profile_id = ?')
      params.push(extra.owner.courierId)
    }

    // 'run' mode: pg's execute() otherwise returns rows, not affectedRows.
    const result = await this.em.getConnection().execute<{ affectedRows?: number }>(
      `UPDATE withdrawal_requests
       SET status = ?, processed_at = NOW(),
           processed_by = COALESCE(?, processed_by),
           rejection_reason = COALESCE(?, rejection_reason),
           provider_reference = COALESCE(?, provider_reference)
       WHERE ${conditions.join(' AND ')}`,
      [to, extra.processedBy ?? null, extra.rejectionReason ?? null, extra.providerReference ?? null, ...params],
      'run',
    )
    if ((result.affectedRows ?? 0) === 0) {
      throw new BadRequestException('Cette demande ne peut plus être traitée')
    }

    this.em.clear()
    return this.em.findOneOrFail(WithdrawalRequest, { id: withdrawalId }, {
      populate: ['payoutNumber', 'supplier', 'courier', 'wallet'],
    })
  }

  private async refund(withdrawal: WithdrawalRequest, description: string): Promise<void> {
    await this.walletService.credit(withdrawal.wallet.id, {
      type: WalletTransactionType.WITHDRAWAL_REFUND,
      amount: Number(withdrawal.amount),
      description,
      withdrawalId: withdrawal.id,
    })
  }

  private async notifyOwner(withdrawal: WithdrawalRequest, title: string, body: string): Promise<void> {
    try {
      const payee = await this.resolvePayee(withdrawal)
      await this.notificationsService.send({
        user: payee.user,
        type: this.payoutNotificationType(payee.ownerType),
        title,
        body,
        data: { withdrawalId: withdrawal.id },
        channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      })
    }
    catch (error) {
      this.logger.error(`Notification failed for withdrawal ${withdrawal.id}`, error)
    }
  }

  /** Loads the user behind the owner — fresh from the DB, the row may come from a cleared EM. */
  private async resolvePayee(owned: { supplier?: { id: string } | null, courier?: { id: string } | null }): Promise<Payee> {
    if (owned.supplier) {
      const supplier = await this.em.findOneOrFail(Supplier, { id: owned.supplier.id }, { populate: ['user'] })
      return { user: supplier.user, displayName: supplier.shopName, ownerType: 'SUPPLIER' }
    }
    if (owned.courier) {
      const courier = await this.em.findOneOrFail(CourierProfile, { id: owned.courier.id }, { populate: ['user'] })
      return { user: courier.user, displayName: courier.fullName, ownerType: 'COURIER' }
    }
    throw new BadRequestException('Bénéficiaire introuvable')
  }

  private payoutNotificationType(ownerType: PayoutOwnerType): NotificationType {
    return ownerType === 'COURIER' ? NotificationType.COURIER_PAYOUT : NotificationType.PAYMENT_RELEASED
  }

  /** `supplierId` / `shopName` are kept (nullable) so existing BO screens keep working. */
  private mapOwner(owned: { supplier?: Supplier | null, courier?: CourierProfile | null }) {
    const ownerType: PayoutOwnerType = owned.courier ? 'COURIER' : 'SUPPLIER'
    return {
      ownerType,
      ownerName: owned.supplier?.shopName ?? owned.courier?.fullName ?? '',
      supplierId: owned.supplier?.id ?? null,
      shopName: owned.supplier?.shopName ?? null,
      courierId: owned.courier?.id ?? null,
    }
  }

  private ownerWhere(owner: PayoutOwner): { supplier: { id: string } } | { courier: { id: string } } {
    if (owner.supplierId) {
      return { supplier: { id: owner.supplierId } }
    }
    if (owner.courierId) {
      return { courier: { id: owner.courierId } }
    }
    throw new BadRequestException('Propriétaire du portefeuille introuvable')
  }

  private ownerRefs(owner: PayoutOwner): { supplier: Supplier } | { courier: CourierProfile } {
    if (owner.supplierId) {
      return { supplier: this.em.getReference(Supplier, owner.supplierId) }
    }
    if (owner.courierId) {
      return { courier: this.em.getReference(CourierProfile, owner.courierId) }
    }
    throw new BadRequestException('Propriétaire du portefeuille introuvable')
  }

  /** Raw-SQL round-trips can hand dates back as strings. */
  private toIso(value: Date | string | null | undefined): string | null {
    if (!value)
      return null
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
  }

  private mapNumber(number: PayoutNumber) {
    return {
      id: number.id,
      phoneNumber: number.phoneNumber,
      operator: number.operator,
      operatorLabel: OPERATOR_LABELS[number.operator] ?? number.operator,
      holderName: number.holderName,
      status: number.status,
      rejectionReason: number.rejectionReason ?? null,
      createdAt: this.toIso(number.createdAt)!,
    }
  }

  private mapWithdrawal(withdrawal: WithdrawalRequest) {
    return {
      id: withdrawal.id,
      amount: Number(withdrawal.amount),
      status: withdrawal.status,
      phoneNumber: withdrawal.payoutNumber.phoneNumber,
      operatorLabel: OPERATOR_LABELS[withdrawal.payoutNumber.operator] ?? withdrawal.payoutNumber.operator,
      rejectionReason: withdrawal.rejectionReason ?? null,
      providerReference: withdrawal.providerReference ?? null,
      createdAt: this.toIso(withdrawal.createdAt)!,
      processedAt: this.toIso(withdrawal.processedAt),
    }
  }
}
