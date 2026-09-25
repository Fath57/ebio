import type { CartSync } from './contracts/cart.contract'
import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { User } from '../auth/auth.entity'
import { Product } from '../products/entities/product.entity'
import { Supplier } from '../suppliers/supplier.entity'
import { CartItem } from './entities/cart-item.entity'
import { Cart } from './entities/cart.entity'

export interface CartLine {
  productId: string
  supplierId: string
  supplierName: string
  name: string
  imageUrl: string | null
  pricePerUnit: number
  unit: string
  quantity: number
}

/** A signature of the basket's contents, to tell a real change from a re-send. */
function signatureOf(items: Array<{ productId: string, quantity: number }>): string {
  return [...items]
    .map(item => `${item.productId}:${item.quantity}`)
    .sort()
    .join('|')
}

@Injectable()
export class CartService {
  constructor(private readonly em: EntityManager) {}

  /**
   * Replaces the stored basket with the one the app holds.
   *
   * The app stays the authority while it is open — it is where the basket is
   * edited — and the server keeps the copy that outlives the phone. Prices and
   * names are read from the catalogue here rather than taken from the app: a
   * client is free to send anything, and a basket is about to become money.
   */
  async sync(userId: string, input: CartSync): Promise<CartLine[]> {
    const fork = this.em.fork()
    const cart = await this.load(fork, userId)
    const previous = signatureOf(cart.items.getItems().map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
    })))

    cart.items.removeAll()

    const products = input.items.length === 0
      ? []
      : await fork.find(Product, { id: { $in: input.items.map(item => item.productId) } }, { populate: ['supplier'] })
    const byId = new Map(products.map(product => [product.id, product]))

    for (const line of input.items) {
      const product = byId.get(line.productId)
      // A product removed from the catalogue simply drops out of the basket;
      // refusing the whole sync would strand the app with nothing to do.
      if (!product) {
        continue
      }
      cart.items.add(fork.create(CartItem, {
        cart,
        product: fork.getReference(Product, product.id),
        supplier: fork.getReference(Supplier, product.supplier.id),
        productName: product.name,
        unitPrice: Math.round(product.pricePerUnit),
        quantity: line.quantity,
      }))
    }

    const current = signatureOf(input.items)
    if (current !== previous) {
      // Only a real change restarts the clock — and gives the basket another
      // chance at a reminder.
      cart.updatedAt = new Date()
      cart.remindedAt = undefined
      cart.reminders = 0
    }

    await fork.flush()
    return this.toLines(cart)
  }

  /** The stored basket, for an app that has just signed in elsewhere. */
  async read(userId: string): Promise<{ items: CartLine[], updatedAt: string | null }> {
    const fork = this.em.fork()
    const cart = await fork.findOne(
      Cart,
      { user: { id: userId } },
      { populate: ['items', 'items.product', 'items.supplier'] },
    )
    if (!cart) {
      return { items: [], updatedAt: null }
    }
    return { items: this.toLines(cart), updatedAt: cart.updatedAt.toISOString() }
  }

  /** Emptied when the basket becomes orders; there is nothing left to abandon. */
  async clear(userId: string): Promise<void> {
    const fork = this.em.fork()
    const cart = await fork.findOne(Cart, { user: { id: userId } }, { populate: ['items'] })
    if (!cart) {
      return
    }
    cart.items.removeAll()
    cart.updatedAt = new Date()
    cart.remindedAt = undefined
    cart.reminders = 0
    await fork.flush()
  }

  private async load(fork: EntityManager, userId: string): Promise<Cart> {
    const existing = await fork.findOne(
      Cart,
      { user: { id: userId } },
      { populate: ['items', 'items.product'] },
    )
    if (existing) {
      return existing
    }
    return fork.create(Cart, { user: fork.getReference(User, userId) })
  }

  private toLines(cart: Cart): CartLine[] {
    return cart.items.getItems().map(item => ({
      productId: item.product.id,
      supplierId: item.supplier.id,
      supplierName: item.supplier.shopName,
      name: item.productName,
      imageUrl: item.product.photos?.[0] ?? null,
      pricePerUnit: item.unitPrice,
      unit: item.product.unit,
      quantity: item.quantity,
    }))
  }
}
