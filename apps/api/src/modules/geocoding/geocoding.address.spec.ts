import { describe, expect, it } from 'vitest'
import { readableAddress, withoutPlusCode } from './geocoding.service'

/**
 * Where streets have no names, Google answers with its own grid.
 *
 * Much of Cotonou is addressed that way, and « 4HQ6+2MJ, Cotonou » is of no
 * use to a buyer confirming a delivery or to a courier finding a door. What is
 * checked here is that a readable answer is preferred when there is one, that
 * the code is dropped when there is not, and — the part that would hurt — that
 * an ordinary address is never mistaken for a code.
 */
describe('adresse lisible', () => {
  it('préfère le résultat qui n\'est pas un Plus Code', () => {
    const results = [
      { formatted_address: '4HQ6+2MJ, Cotonou, Bénin' },
      { formatted_address: 'Rue 1.234, Cadjèhoun, Cotonou, Bénin' },
    ]
    expect(readableAddress(results)).toBe('Rue 1.234, Cadjèhoun, Cotonou, Bénin')
  })

  it('retire le code et garde la ville quand tout est en Plus Code', () => {
    const results = [
      { formatted_address: '4HQ6+2MJ, Cotonou, Bénin' },
      { formatted_address: 'Q2+3V Cotonou, Bénin' },
    ]
    expect(readableAddress(results)).toBe('Cotonou, Bénin')
  })

  it('rend null quand Google ne connaît rien là', () => {
    expect(readableAddress([])).toBeNull()
    expect(readableAddress([{ formatted_address: '   ' }])).toBeNull()
  })

  it('ne prend pas une vraie adresse pour un code', () => {
    // A `+` in the middle, a name with vowels, a number: none of these are
    // grid references, and mangling them would be worse than the problem.
    for (const address of [
      'Carrefour Vodjè, Cotonou',
      'Avenue Steinmetz, Cotonou, Bénin',
      'Étoile Rouge + 200 m, Cotonou',
      '01 BP 1234, Cotonou',
    ]) {
      expect(withoutPlusCode(address)).toBe(address)
    }
  })

  it('laisse un texte intact quand il n\'y aurait plus rien après', () => {
    expect(withoutPlusCode('4HQ6+2MJ')).toBe('4HQ6+2MJ')
  })
})
