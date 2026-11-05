import type { EntityManager } from '@mikro-orm/postgresql'
import type { INestApplication } from '@nestjs/common'
import type { Buffer } from 'node:buffer'
import { BadRequestException } from '@nestjs/common'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUserData } from '../../../factories/user.factory'
import { initializeTestApp } from '../../../test/helpers/test-app.helper'
import { AuditModule } from '../../admin/audit.module'
import { RolesModule } from '../../auth/roles/roles.module'
import { BusinessCardsModule } from '../business-cards.module'
import { BusinessCardsService } from '../business-cards.service'

async function createShop(em: EntityManager, name: string, status: string): Promise<string> {
  const user = await createUserData(em)
  await em.flush()
  const [shop] = await em.getConnection().execute(
    `INSERT INTO suppliers (user_id, shop_name, type, mode, validation_status, neighborhood, address, profile_photo, "createdAt", "updatedAt")
     VALUES (?, ?, 'TRANSFORMER', 'ORDER', ?, 'Vedoko', 'Cotonou', 'https://images.example.com/not-our-storage.png', NOW(), NOW())
     RETURNING id`,
    [user.id, name, status],
  ) as Array<{ id: string }>
  return shop.id
}

function pageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
}

describe('génération des cartes de visite (e2e)', () => {
  beforeEach(async (context) => {
    const { orm, app } = await initializeTestApp({ orm: context.orm, poolMax: 4 }, {
      imports: [RolesModule, AuditModule, BusinessCardsModule],
    })
    context.app = app
    context.em = orm.em.fork()
  })

  it('ne sort que les fournisseurs validés, car seul eux ont une page pour le QR', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const validated = await createShop(em, 'Délice des Rois', 'VALIDATED')
    const pending = await createShop(em, 'En attente', 'PENDING')
    const service = app.get(BusinessCardsService)

    expect(pageCount(await service.generate({ supplierIds: [validated, pending] }))).toBe(1)
    expect(pageCount(await service.generate({ all: true }))).toBe(1)
  })

  it('refuse une sélection sans aucun fournisseur validé', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const pending = await createShop(em, 'En attente', 'PENDING')

    await expect(app.get(BusinessCardsService).generate({ supplierIds: [pending] }))
      .rejects
      .toBeInstanceOf(BadRequestException)
  })

  it('génère quand même la carte si le logo n\'est pas sur notre stockage', async (context) => {
    const { em, app } = context as { em: EntityManager, app: INestApplication }
    const id = await createShop(em, 'Kira', 'VALIDATED')

    const pdf = await app.get(BusinessCardsService).generate({ supplierIds: [id] })

    expect(pageCount(pdf)).toBe(1)
    expect(pdf.toString('latin1')).not.toMatch(/\/Subtype\s*\/Image/)
  })
})
