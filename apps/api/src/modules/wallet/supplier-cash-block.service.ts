import { EntityManager } from '@mikro-orm/postgresql'
import { BadRequestException, Injectable } from '@nestjs/common'
import { PlatformSettingsService } from '../settings/platform-settings.service'

export interface SupplierCashBlock {
  /** Current shop balance, negative. */
  balance: number
  /** Tolerated debt, positive. */
  limit: number
}

/**
 * Cash orders never put money in eBio's hands: its commission is debited
 * from the shop wallet at delivery, and a cash-only shop never earns the
 * credits that would pay it back. Past the platform debt limit the shop
 * stops receiving cash orders — online and wallet payments stay open, and
 * they are what pays the debt down, along with a top-up.
 */
@Injectable()
export class SupplierCashBlockService {
  constructor(
    private readonly em: EntityManager,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** Null when the shop may still be paid in cash. */
  async getSupplierCashBlock(supplierId: string): Promise<SupplierCashBlock | null> {
    const limit = await this.platformSettings.getSupplierMaxDebt()
    if (limit <= 0) {
      return null
    }
    const balance = await this.readBalance(supplierId)
    return balance < -limit ? { balance, limit } : null
  }

  /** Throws the buyer-facing refusal when the shop is blocked. */
  async assertCashAllowed(supplierId: string, shopName: string): Promise<void> {
    if (await this.getSupplierCashBlock(supplierId)) {
      throw new BadRequestException(cashBlockedMessage(shopName))
    }
  }

  /**
   * Read straight from the table: balances are written in raw SQL, so an
   * entity already in the identity map may hold a stale one.
   */
  private async readBalance(supplierId: string): Promise<number> {
    const [row] = await this.em.getConnection().execute<Array<{ balance: string }>>(
      `SELECT balance FROM wallets WHERE supplier_id = ? LIMIT 1`,
      [supplierId],
    )
    return row ? Number(row.balance) : 0
  }
}

export function cashBlockedMessage(shopName: string): string {
  return `${shopName} n'accepte pas le paiement en espèces pour le moment. Payez en ligne ou avec votre portefeuille.`
}
