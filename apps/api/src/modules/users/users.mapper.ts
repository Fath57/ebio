import type { User } from '../auth/auth.entity'
import type { UserResponse, UserSummary } from './contracts/user.contract'
import { displayCurrencyEnum } from '../currency/contracts/currency.contract'

/** The column is guarded by a CHECK; an unexpected value still shows in FCFA. */
function toDisplayCurrency(value: string): UserResponse['displayCurrency'] {
  const parsed = displayCurrencyEnum.safeParse(value)
  return parsed.success ? parsed.data : 'XOF'
}

export class UserMapper {
  static toResponse(user: User, permissions: Array<{ action: string, subject: string }> = []): UserResponse {
    const staffRole = user.userRole as { id: string, name: string } | undefined
    return {
      staffRole: user.role === 'ADMIN' && staffRole?.name ? { id: staffRole.id, name: staffRole.name } : null,
      permissions,
      id: user.id,
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: user.role,
      image: user.image ?? null,
      // The app uses this to know whether agreement has already been given.
      termsAcceptedAt: user.termsAcceptedAt ? user.termsAcceptedAt.toISOString() : null,
      displayCurrency: toDisplayCurrency(user.displayCurrency),
      createdAt: user.createdAt.toISOString(),
    }
  }

  static toSummary(user: User): UserSummary {
    return {
      id: user.id,
      name: user.name,
      image: user.image ?? null,
    }
  }
}
