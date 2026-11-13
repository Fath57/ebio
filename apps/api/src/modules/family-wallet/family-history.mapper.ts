import type { FamilyTransaction, FamilyTransactionList, MemberFamilyTransaction, MemberFamilyTransactionList, MemberFamilyWallet } from './contracts/family-wallet.contract'
import type { FamilyHistoryEntry, FamilyHistoryPage } from './family-history'
import type { MemberWalletView } from './family-member-view.service'
import { firstName } from '../gift/gift-texts'

/** Member's view of a line: no balance after it, no member name (it is theirs). */
function toMemberTransaction(entry: FamilyHistoryEntry): MemberFamilyTransaction {
  const { transaction, order } = entry
  return {
    id: transaction.id,
    type: transaction.type,
    amount: Number(transaction.amount),
    createdAt: transaction.createdAt.toISOString(),
    ...(order ? { order } : {}),
  }
}

/** History lines and the member's wallets, shaped for the apps. */
export class FamilyHistoryMapper {
  static toTransaction(entry: FamilyHistoryEntry): FamilyTransaction {
    const { transaction, member, order } = entry
    return {
      id: transaction.id,
      type: transaction.type,
      amount: Number(transaction.amount),
      balanceAfter: Number(transaction.balanceAfter),
      createdAt: transaction.createdAt.toISOString(),
      ...(member ? { member: { id: member.id, nickname: member.nickname } } : {}),
      ...(order ? { order } : {}),
    }
  }

  static toTransactionList(page: FamilyHistoryPage): FamilyTransactionList {
    return { items: page.entries.map(FamilyHistoryMapper.toTransaction), total: page.total }
  }

  static toMemberTransactionList(page: FamilyHistoryPage): MemberFamilyTransactionList {
    return { items: page.entries.map(toMemberTransaction), total: page.total }
  }

  static toMemberWallet(view: MemberWalletView): MemberFamilyWallet {
    return {
      memberId: view.member.id,
      payerFirstName: firstName(view.payerName),
      status: view.status,
      spendable: view.spendable,
      limits: {
        monthlyCap: view.effective.monthlyCap,
        orderMax: view.effective.orderMax,
        categoryNames: view.categoryNames,
      },
      spentThisMonth: view.spentThisMonth,
    }
  }
}
