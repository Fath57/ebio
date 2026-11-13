import type { User } from '../auth/auth.entity'
import { NotificationChannel, NotificationType } from './notification.entity'
import { NotificationsService } from './notifications.service'

/**
 * Pas de SMS hors du Bénin : l'opérateur ne joint que les numéros +229. Le
 * reste de la notification part quand même.
 */
function buildService() {
  const forked = {
    create: vi.fn().mockImplementation((_entity: unknown, data: Record<string, unknown>) => ({ ...data })),
    getReference: vi.fn().mockImplementation((_entity: unknown, id: string) => ({ id })),
    find: vi.fn().mockResolvedValue([{ token: 'device-token', app: 'client' }]),
    flush: vi.fn().mockResolvedValue(undefined),
  }
  const em = { fork: vi.fn().mockReturnValue(forked) }
  const fcm = { sendToDevices: vi.fn().mockResolvedValue(undefined) }
  const sms = { send: vi.fn().mockResolvedValue(true) }
  const service = new NotificationsService(em as never, fcm as never, sms as never)
  return { service, fcm, sms }
}

function userWithPhone(phone: string): User {
  return { id: 'user-1', phone } as User
}

const notification = {
  type: NotificationType.ORDER_DELIVERED,
  title: 'Commande livrée',
  body: 'Votre panier a été remis.',
  channels: [NotificationChannel.PUSH, NotificationChannel.SMS],
}

describe('garde SMS hors du Bénin', () => {
  it('envoie le push mais pas le SMS à un numéro +33', async () => {
    const { service, fcm, sms } = buildService()

    await service.send({ ...notification, user: userWithPhone('+33612345678') })

    expect(fcm.sendToDevices).toHaveBeenCalledOnce()
    expect(sms.send).not.toHaveBeenCalled()
  })

  it('envoie le push et le SMS à un numéro +229', async () => {
    const { service, fcm, sms } = buildService()

    await service.send({ ...notification, user: userWithPhone('+2290197123456') })

    expect(fcm.sendToDevices).toHaveBeenCalledOnce()
    expect(sms.send).toHaveBeenCalledWith('+2290197123456', notification.body)
  })
})
