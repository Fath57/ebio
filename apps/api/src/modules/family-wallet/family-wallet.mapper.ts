import type { FamilyLimitsInput, FamilyMemberResponse, FamilyWalletResponse } from './contracts/family-wallet.contract'
import type { FamilyWalletMember } from './entities/family-wallet-member.entity'
import type { FamilyWallet } from './entities/family-wallet.entity'
import type { FamilyMemberView, FamilyWalletView } from './family-wallets.service'
import { effectiveLimits, toAmount } from './family-limits'

/** Limits as the payer set them on the wallet. */
function defaultsOf(wallet: FamilyWallet): FamilyLimitsInput {
  return {
    monthlyCap: toAmount(wallet.defaultMonthlyCap),
    orderMax: toAmount(wallet.defaultOrderMax),
    categoryIds: wallet.defaultCategoryIds ?? null,
  }
}

/** Limits as the payer set them on the member; null means « as the default ». */
function ownLimitsOf(member: FamilyWalletMember): FamilyLimitsInput {
  return {
    monthlyCap: toAmount(member.monthlyCap),
    orderMax: toAmount(member.orderMax),
    categoryIds: member.categoryIds ?? null,
  }
}

export class FamilyWalletMapper {
  static toMemberResponse(wallet: FamilyWallet, view: FamilyMemberView): FamilyMemberResponse {
    const { member, spentThisMonth } = view
    return {
      id: member.id,
      nickname: member.nickname,
      phone: member.phone,
      status: member.status,
      limits: ownLimitsOf(member),
      effective: effectiveLimits(wallet, member),
      spentThisMonth,
    }
  }

  static toResponse(view: FamilyWalletView): FamilyWalletResponse {
    return {
      id: view.wallet.id,
      status: view.wallet.status,
      balance: view.balance,
      display: view.display,
      lowBalanceThreshold: Number(view.wallet.lowBalanceThreshold),
      defaults: defaultsOf(view.wallet),
      members: view.members.map(member => FamilyWalletMapper.toMemberResponse(view.wallet, member)),
    }
  }
}
