import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { ProviderTransaction, ProviderTransactionKind, ProviderTransactionStatus } from './provider-transaction.entity'

/** Past this, a page still pending at the provider counts as walked away from. */
export const ABANDON_AFTER_MS = 2 * 60 * 60 * 1000

/** How long an abandoned operation is still re-read, in case it is paid late. */
export const WATCH_ABANDONED_FOR_MS = 24 * 60 * 60 * 1000

/** What a gateway's `checkStatus` / `checkPayoutStatus` boils down to. */
export type ProviderOutcome = 'completed' | 'failed' | 'pending'

interface OpenInput {
  provider: string
  kind: ProviderTransactionKind
  subjectId: string
  amount: number
}

/**
 * The journal of operations sent to payment providers.
 *
 * Callers open a line before calling the provider, attach the reference it
 * returns, and record each status read. The business rows keep deciding what
 * the money does; this only makes sure no attempt goes unwritten.
 */
@Injectable()
export class ProviderTransactionsService {
  constructor(private readonly em: EntityManager) {}

  /** Written before the provider is called: an opening that fails still has its line. */
  async open(input: OpenInput): Promise<ProviderTransaction> {
    const transaction = this.em.create(ProviderTransaction, {
      provider: input.provider,
      kind: input.kind,
      subjectId: input.subjectId,
      amount: Math.round(input.amount),
    })
    await this.em.flush()
    return transaction
  }

  async attachReference(transaction: ProviderTransaction, reference: string | null | undefined): Promise<void> {
    if (!reference) {
      return
    }
    transaction.reference = reference
    await this.em.flush()
  }

  /** The provider refused the operation outright: nothing was opened on its side. */
  async markFailed(transaction: ProviderTransaction, reason: string): Promise<void> {
    transaction.status = ProviderTransactionStatus.FAILED
    transaction.failureReason = reason.slice(0, 1000)
    transaction.settledAt = new Date()
    await this.em.flush()
  }

  /**
   * Writes what the provider just said about a reference, on its latest line.
   *
   * The provider is the truth: a line marked failed or abandoned that the
   * provider now reports as paid becomes completed. A completed line never
   * moves again. Returns the status written, or null when the reference is
   * not in the journal (an operation from before it existed).
   */
  async recordOutcome(reference: string, outcome: ProviderOutcome): Promise<ProviderTransactionStatus | null> {
    const transaction = await this.em.findOne(
      ProviderTransaction,
      { reference },
      { orderBy: { createdAt: 'DESC' } },
    )
    if (!transaction) {
      return null
    }

    transaction.providerStatus = outcome
    transaction.lastCheckedAt = new Date()
    if (transaction.status !== ProviderTransactionStatus.COMPLETED) {
      const next = nextStatus(transaction.status, outcome, transaction.createdAt)
      if (next !== transaction.status) {
        transaction.status = next
        transaction.settledAt = next === ProviderTransactionStatus.PENDING ? null : new Date()
      }
    }
    await this.em.flush()
    return transaction.status
  }

  /**
   * What the reconciliation should ask the provider about: everything still
   * open, and what was abandoned recently enough to be paid late.
   */
  async findToReconcile(kind: ProviderTransactionKind, now = new Date()): Promise<ProviderTransaction[]> {
    return this.em.find(ProviderTransaction, {
      kind,
      reference: { $ne: null },
      $or: [
        { status: ProviderTransactionStatus.PENDING },
        {
          status: ProviderTransactionStatus.ABANDONED,
          createdAt: { $gt: new Date(now.getTime() - WATCH_ABANDONED_FOR_MS) },
        },
      ],
    }, { orderBy: { createdAt: 'ASC' }, limit: 200 })
  }
}

/**
 * The journal's state machine, kept pure for the tests.
 *
 * Still pending after `ABANDON_AFTER_MS` means abandoned; any definite answer
 * from the provider wins over what we had concluded.
 */
export function nextStatus(
  current: ProviderTransactionStatus,
  outcome: ProviderOutcome,
  openedAt: Date,
  now = new Date(),
): ProviderTransactionStatus {
  if (current === ProviderTransactionStatus.COMPLETED) {
    return current
  }
  if (outcome === 'completed') {
    return ProviderTransactionStatus.COMPLETED
  }
  if (outcome === 'failed') {
    return ProviderTransactionStatus.FAILED
  }
  if (now.getTime() - openedAt.getTime() > ABANDON_AFTER_MS) {
    return ProviderTransactionStatus.ABANDONED
  }
  return current === ProviderTransactionStatus.ABANDONED ? current : ProviderTransactionStatus.PENDING
}
