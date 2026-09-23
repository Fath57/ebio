import { searchTerms } from '../search.service'

/**
 * « huile arachide » ne rendait rien alors que « huile » et « arachide »
 * rendaient chacun quelque chose : la requête entière était cherchée comme une
 * sous-chaîne, et l'apostrophe de « Huile d'arachide pure » suffisait à tout
 * faire échouer. Personne n'écrit le nom exact d'un produit.
 */
describe('découpage d\'une recherche', () => {
  it('sépare les mots, qui seront tous exigés', () => {
    expect(searchTerms('huile arachide')).toEqual(['huile', 'arachide'])
  })

  it('absorbe les espaces multiples et les bords', () => {
    expect(searchTerms('  piment   frais  ')).toEqual(['piment', 'frais'])
  })

  // « d' » dans « huile d'arachide » ne discrimine rien et ferait
  // correspondre la moitié du catalogue.
  it('écarte les mots d\'une seule lettre', () => {
    expect(searchTerms('huile d arachide')).toEqual(['huile', 'arachide'])
  })

  it('borne le nombre de mots : au-delà, ce n\'est plus une recherche', () => {
    expect(searchTerms('un deux trois quatre cinq six sept huit')).toHaveLength(6)
  })

  it('rend une liste vide pour une requête sans contenu', () => {
    expect(searchTerms('   ')).toEqual([])
  })
})
