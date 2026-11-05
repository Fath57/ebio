import { describe, expect, it } from 'vitest'
import { cardInitials, cardPlace, nameFontSize, wrapLines } from '../business-card-text'

describe('cardPlace', () => {
  it('assemble le quartier et la ville', () => {
    expect(cardPlace('Vedoko', 'Cotonou')).toBe('Vedoko, Cotonou')
  })

  it('écarte un e-mail ou un téléphone saisi comme adresse', () => {
    expect(cardPlace('Agla', 'contact@boutique.bj')).toBe('Agla')
    expect(cardPlace('Akpakpa', '+229 01 96 23 12 78')).toBe('Akpakpa')
    expect(cardPlace(null, '0196231278')).toBe('')
  })

  it('ne répète pas un quartier déjà dans l\'adresse', () => {
    expect(cardPlace('Zogbodomey', 'Zogbodomey')).toBe('Zogbodomey')
    expect(cardPlace('Ganhi', 'Marché Ganhi, Cotonou')).toBe('Marché Ganhi, Cotonou')
  })

  it('garde le quartier seul quand l\'adresse est trop longue pour la carte', () => {
    expect(cardPlace('Hayakpa', 'Tori arrondissement de Azohouè-Aliho')).toBe('Hayakpa')
  })

  it('coupe une parenthèse et remet une adresse en capitales en minuscules', () => {
    expect(cardPlace('Dossêvié', 'Hévié (commune  Ab - Calavi')).toBe('Dossêvié, Hévié')
    expect(cardPlace(null, 'NATITINGOU')).toBe('Natitingou')
  })

  it('reste vide sans aucune information', () => {
    expect(cardPlace(null, undefined)).toBe('')
  })
})

describe('cardInitials', () => {
  it('prend les initiales des deux premiers mots', () => {
    expect(cardInitials('Oseille House')).toBe('OH')
    expect(cardInitials('  Kira ')).toBe('K')
    expect(cardInitials('Les épices de la madré')).toBe('LÉ')
  })
})

describe('nameFontSize', () => {
  it('réduit un nom long', () => {
    expect(nameFontSize('Kira', 70)).toBe(11.5)
    expect(nameFontSize('Fruits & Legumes Fatou', 70)).toBe(9)
  })

  it('réduit un mot unique assez pour qu\'il tienne', () => {
    expect(nameFontSize('Biocorporation', 70.87)).toBeLessThan(9)
  })
})

describe('wrapLines', () => {
  const byLetter = (line: string) => line.length

  it('coupe aux espaces', () => {
    expect(wrapLines('Délice des Rois', 10, byLetter)).toEqual(['Délice des', 'Rois'])
  })

  it('ne coupe jamais un nom composé sur son tiret', () => {
    expect(wrapLines('Tokpota 1, Porto-Novo', 11, byLetter)).toEqual(['Tokpota 1,', 'Porto-Novo'])
  })

  it('laisse un mot trop long sur sa propre ligne', () => {
    expect(wrapLines('Biocorporation SA', 5, byLetter)).toEqual(['Biocorporation', 'SA'])
  })

  it('ne rend rien pour un texte vide', () => {
    expect(wrapLines('', 10, byLetter)).toEqual([])
  })
})
