import { createCheckoutSchema } from './checkout.contract'

const base = {
  items: [{ productId: '2f1b0c4e-3d5a-4b6c-8d7e-9f0a1b2c3d4e', quantity: 1 }],
  pickupMode: 'DELIVERY',
  paymentMethod: 'FEDAPAY',
  deliveryAddress: 'Fidjrossè, en face de la pharmacie',
}

describe('validation d\'un panier multi-boutiques', () => {
  // The field is free text in the UI, text in the column and a string on the
  // entity; only this schema ever asked for a timestamp, and every cart where
  // the buyer filled the slot was refused because of it.
  it('accepte un créneau écrit en toutes lettres', () => {
    const result = createCheckoutSchema.safeParse({
      ...base,
      deliverySlot: 'Demain matin entre 8h et 12h',
    })
    expect(result.success).toBe(true)
  })

  it('accepte un panier sans créneau', () => {
    expect(createCheckoutSchema.safeParse(base).success).toBe(true)
  })

  it('refuse une adresse trop courte pour qu\'un livreur trouve', () => {
    const result = createCheckoutSchema.safeParse({ ...base, deliveryAddress: 'Cotonou' })
    expect(result.success).toBe(false)
  })
})
