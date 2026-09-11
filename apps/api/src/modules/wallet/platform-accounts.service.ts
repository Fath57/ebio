import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { PlatformAccount } from './entities/wallet.entity'
import { WalletService } from './wallet.service'

export interface PlatformAccountSummary {
  account: PlatformAccount
  /** Live balance, written as the money is earned. */
  balance: number
  /** Net movement over the requested period. */
  periodAmount: number
}

export interface PlatformAccountsOverview {
  accounts: PlatformAccountSummary[]
  /** Revenue accounts minus cost centres. */
  netBalance: number
  netPeriod: number
  /** Net per month over the last 12 months, oldest first. */
  monthly: Array<{ month: string, net: number }>
}

/**
 * eBio's own books. Balances are not recomputed from the order history: each
 * money event posts to its account as it happens (see WalletService.post),
 * so this only reads what is already written.
 */
@Injectable()
export class PlatformAccountsService {
  constructor(
    private readonly em: EntityManager,
    private readonly wallets: WalletService,
  ) {}

  async overview(from?: Date, to?: Date): Promise<PlatformAccountsOverview> {
    const rows = await this.em.getConnection().execute(
      `SELECT w.platform_account AS account,
              w.balance,
              COALESCE(SUM(t.amount) FILTER (
                WHERE (?::timestamptz IS NULL OR t."createdAt" >= ?::timestamptz)
                  AND (?::timestamptz IS NULL OR t."createdAt" < ?::timestamptz)
              ), 0) AS period_amount
       FROM wallets w
       LEFT JOIN wallet_transactions t ON t.wallet_id = w.id
       WHERE w.platform_account IS NOT NULL
       GROUP BY w.platform_account, w.balance
       ORDER BY w.platform_account`,
      [from ?? null, from ?? null, to ?? null, to ?? null],
    ) as Array<{ account: PlatformAccount, balance: string, period_amount: string }>

    const accounts = rows.map(row => ({
      account: row.account,
      balance: Number(row.balance),
      periodAmount: Number(row.period_amount),
    }))
    const monthlyRows = await this.em.getConnection().execute(
      `SELECT to_char(date_trunc('month', t."createdAt"), 'YYYY-MM') AS month,
              COALESCE(SUM(t.amount), 0) AS net
       FROM wallet_transactions t
       JOIN wallets w ON w.id = t.wallet_id
       WHERE w.platform_account IS NOT NULL
         AND t."createdAt" >= date_trunc('month', NOW()) - INTERVAL '11 months'
       GROUP BY 1
       ORDER BY 1`,
    ) as Array<{ month: string, net: string }>

    return {
      accounts,
      // Every posting is already signed: costs are debits, so a plain sum is
      // the net position.
      netBalance: accounts.reduce((total, a) => total + a.balance, 0),
      netPeriod: accounts.reduce((total, a) => total + a.periodAmount, 0),
      monthly: monthlyRows.map(row => ({ month: row.month, net: Number(row.net) })),
    }
  }

  async transactions(account: PlatformAccount, page: number, limit: number) {
    const wallet = await this.wallets.getOrCreate({ platformAccount: account })
    return this.wallets.getTransactions(wallet.id, page, limit)
  }
}
