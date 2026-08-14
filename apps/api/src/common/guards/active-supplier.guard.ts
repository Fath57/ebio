import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { EntityManager } from '@mikro-orm/postgresql'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { Supplier, ValidationStatus } from '../../modules/suppliers/supplier.entity'

/** Méthodes sans effet de bord : consulter reste permis, écrire non. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Interdit toute écriture à un fournisseur suspendu.
 *
 * Sans cette garde, la suspension se limitait à masquer la boutique des
 * recherches — le fournisseur pouvait continuer à modifier son catalogue et à
 * traiter des commandes. Les lectures restent ouvertes pour qu'il puisse
 * constater sa situation et consulter son historique.
 */
@Injectable()
export class ActiveSupplierGuard implements CanActivate {
  constructor(private readonly em: EntityManager) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()

    if (READ_METHODS.has(request.method)) {
      return true
    }

    // `AuthGuard` dépose l'utilisateur Better Auth (`id`) ; les contextes JWT
    // exposent `sub`. On accepte les deux formes.
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

    // Pas de profil fournisseur : la garde ne le concerne pas.
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
