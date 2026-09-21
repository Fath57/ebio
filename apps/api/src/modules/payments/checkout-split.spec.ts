import { describe, expect, it } from 'vitest'
import { splitCheckoutAmount } from './payments.service'

/**
 * A cart collected in one go, split across the orders it covers.
 * What matters is not the elegance of the rule but that no franc gets
 * lost or invented: the split total must equal what was collected.
 */
describe('splitCheckoutAmount', () => {
  const order = (id: string, totalAmount: number) => ({ id, totalAmount })

  it('répartit au prorata des totaux de commande', () => {
    const parts = splitCheckoutAmount(6000, [order('a', 2000), order('b', 4000)])
    expect(parts.map(p => p.amount)).toEqual([2000, 4000])
  })

  it('ajoute les frais de livraison au prorata, sans en perdre', () => {
    // 8 000 d'articles, 800 de livraison : chaque boutique porte sa part.
    const parts = splitCheckoutAmount(8800, [order('a', 1000), order('b', 7000)])
    expect(parts.reduce((sum, p) => sum + p.amount, 0)).toBe(8800)
  })

  it('ne perd pas le franc des arrondis, quel que soit le nombre de boutiques', () => {
    // 1,000 over three equal shares: 333.33… The remainder goes to the last.
    const parts = splitCheckoutAmount(1000, [order('a', 1), order('b', 1), order('c', 1)])
    expect(parts.reduce((sum, p) => sum + p.amount, 0)).toBe(1000)
    expect(parts.map(p => p.amount)).toEqual([333, 333, 334])
  })

  it('ne perd rien sur des montants qui tombent mal', () => {
    for (const total of [999, 1001, 7777, 12345]) {
      const parts = splitCheckoutAmount(total, [order('a', 3), order('b', 5), order('c', 7)])
      expect(parts.reduce((sum, p) => sum + p.amount, 0)).toBe(total)
      expect(parts.every(p => p.amount >= 0)).toBe(true)
    }
  })

  it('reste défini quand les commandes sont à zéro', () => {
    const parts = splitCheckoutAmount(500, [order('a', 0), order('b', 0)])
    expect(parts.map(p => p.amount)).toEqual([0, 0])
  })

  it('rend tout à la seule commande d\'un panier mono-boutique', () => {
    const parts = splitCheckoutAmount(4300, [order('a', 4300)])
    expect(parts).toEqual([{ order: order('a', 4300), amount: 4300 }])
  })
})
