import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { EntityManager } from '@mikro-orm/postgresql'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { Supplier, ValidationStatus } from '../../modules/suppliers/supplier.entity'

/** Side-effect-free methods: looking stays allowed, writing does not. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Refuses every write from a suspended supplier.
 *
 * Without this guard, suspension only hid the shop from searches — the
 * supplier could still edit their catalogue and process orders. Reads stay
 * open so they can see their situation and consult their history.
 */
@Injectable()
export class ActiveSupplierGuard implements CanActivate {
  constructor(private readonly em: EntityManager) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()

    if (READ_METHODS.has(request.method)) {
      return true
    }

    // `AuthGuard` puts the Better Auth user (`id`) here; JWT contexts expose
    // `sub` instead. Both shapes are accepted.
    const user = (request as Request & { user?: { id?: string, sub?: string } }).user
    const userId = user?.id ?? user?.sub
    if (!userId) {
      return true
    }

    const supplier = await this.em.findOne(
      Supplier,
      { user: { id: userId } },
      { fields: ['validationStatus'] },
    )

    // No supplier profile: this guard does not concern them.
    if (!supplier) {
      return true
    }

    if (supplier.validationStatus === ValidationStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Votre compte est suspendu. Contactez l\'équipe eBio pour le réactiver.',
      )
    }

    return true
  }
}
