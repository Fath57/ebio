import type { User } from '../auth/auth.entity'
import type { UserResponse, UserSummary } from './contracts/user.contract'

export class UserMapper {
  static toResponse(user: User): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: user.role,
      image: user.image ?? null,
      biometricEnabled: user.biometricEnabled,
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
