import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ChatService } from './chat.service'
import { ConversationKind } from './entities/conversation.entity'

interface MockEm {
  fork: () => MockEm
  findOne: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  persistAndFlush: ReturnType<typeof vi.fn>
}

function buildService() {
  const em: MockEm = {
    fork: () => em,
    findOne: vi.fn(),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => ({ id: 'conv-new', ...data })),
    persistAndFlush: vi.fn().mockResolvedValue(undefined),
  }
  const service = new ChatService(em as never)
  return { service, em }
}

const buyer = { id: 'buyer-1', name: 'Amina' }
const courier = { id: 'courier-1', fullName: 'Jean Livreur', user: { id: 'courier-user-1' } }

function buildDelivery(extra: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    courier,
    order: { id: 'order-1', orderNumber: 'EB-20260829-001', buyer },
    ...extra,
  }
}

describe('chatService.getOrCreateDeliveryConversation', () => {
  it('rejects an unknown delivery', async () => {
    const { service, em } = buildService()
    em.findOne.mockResolvedValueOnce(null)
    await expect(service.getOrCreateDeliveryConversation('nope', 'buyer-1'))
      .rejects
      .toBeInstanceOf(NotFoundException)
  })

  it('rejects a delivery without a courier yet', async () => {
    const { service, em } = buildService()
    em.findOne.mockResolvedValueOnce(buildDelivery({ courier: null }))
    await expect(service.getOrCreateDeliveryConversation('delivery-1', 'buyer-1'))
      .rejects
      .toBeInstanceOf(BadRequestException)
  })

  it('rejects a user who is neither the buyer nor the courier', async () => {
    const { service, em } = buildService()
    em.findOne.mockResolvedValueOnce(buildDelivery())
    await expect(service.getOrCreateDeliveryConversation('delivery-1', 'stranger'))
      .rejects
      .toBeInstanceOf(ForbiddenException)
    expect(em.create).not.toHaveBeenCalled()
  })

  it('returns the existing thread of the delivery to the courier', async () => {
    const { service, em } = buildService()
    const existing = { id: 'conv-1', kind: ConversationKind.COURIER, deliveryId: 'delivery-1' }
    em.findOne
      .mockResolvedValueOnce(buildDelivery())
      .mockResolvedValueOnce(existing)
    const result = await service.getOrCreateDeliveryConversation('delivery-1', 'courier-user-1')
    expect(result).toBe(existing)
    expect(em.create).not.toHaveBeenCalled()
  })

  it('creates the thread for the buyer when none exists', async () => {
    const { service, em } = buildService()
    em.findOne
      .mockResolvedValueOnce(buildDelivery())
      .mockResolvedValueOnce(null)
    const result = await service.getOrCreateDeliveryConversation('delivery-1', 'buyer-1')
    expect(em.create).toHaveBeenCalledWith(expect.anything(), {
      kind: ConversationKind.COURIER,
      buyer,
      courier,
      deliveryId: 'delivery-1',
      orderId: 'order-1',
    })
    expect(em.persistAndFlush).toHaveBeenCalledTimes(1)
    expect(result.kind).toBe(ConversationKind.COURIER)
  })
})

describe('chatService.getRecipientInfo', () => {
  function conversation(kind: ConversationKind) {
    return {
      id: 'conv-1',
      kind,
      deliveryId: kind === ConversationKind.COURIER ? 'delivery-1' : undefined,
      buyer,
      supplier: kind === ConversationKind.SUPPLIER ? { id: 'sup-1', user: { id: 'sup-user-1' } } : null,
      courier: kind === ConversationKind.COURIER ? courier : null,
    }
  }

  it('routes a buyer message on a delivery thread to the courier app', async () => {
    const { service, em } = buildService()
    em.findOne.mockResolvedValueOnce(conversation(ConversationKind.COURIER))
    const info = await service.getRecipientInfo('conv-1', 'buyer-1')
    expect(info).toMatchObject({ user: courier.user, apps: ['courier'], kind: ConversationKind.COURIER, deliveryId: 'delivery-1' })
  })

  it('routes a courier message to the client app', async () => {
    const { service, em } = buildService()
    em.findOne.mockResolvedValueOnce(conversation(ConversationKind.COURIER))
    const info = await service.getRecipientInfo('conv-1', 'courier-user-1')
    expect(info).toMatchObject({ user: buyer, apps: ['client'] })
  })

  it('routes a buyer message on a shop thread to the supplier app', async () => {
    const { service, em } = buildService()
    em.findOne.mockResolvedValueOnce(conversation(ConversationKind.SUPPLIER))
    const info = await service.getRecipientInfo('conv-1', 'buyer-1')
    expect(info).toMatchObject({ user: { id: 'sup-user-1' }, apps: ['supplier'], deliveryId: null })
  })
})
