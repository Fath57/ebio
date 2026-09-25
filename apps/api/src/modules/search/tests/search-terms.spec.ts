import { searchTerms } from '../search.service'

/**
 * "huile arachide" returned nothing while "huile" and "arachide" each returned
 * something: the whole query was searched as one substring, and the apostrophe
 * in "Huile d'arachide pure" was enough to break it. Nobody types a product's
 * exact name.
 */
describe('découpage d\'une recherche', () => {
  it('sépare les mots, qui seront tous exigés', () => {
    expect(searchTerms('huile arachide')).toEqual(['huile', 'arachide'])
  })

  it('absorbe les espaces multiples et les bords', () => {
    expect(searchTerms('  piment   frais  ')).toEqual(['piment', 'frais'])
  })

  // "d'" in "huile d'arachide" discriminates nothing and would match half the
  // catalogue.
  it('écarte les mots d\'une seule lettre', () => {
    expect(searchTerms('huile d arachide')).toEqual(['huile', 'arachide'])
  })

  it('borne le nombre de mots : au-delà, ce n\'est plus une recherche', () => {
    expect(searchTerms('un deux trois quatre cinq six sept huit')).toHaveLength(6)
  })

  it('rend une liste vide pour une requête sans contenu', () => {
    expect(searchTerms('   ')).toEqual([])
  })

  // "deux piments" did not find "Piment frais local", and the assistant
  // announced a shortage that did not exist.
  it('retire le pluriel, pour que « piments » trouve « Piment »', () => {
    expect(searchTerms('piments')).toEqual(['piment'])
    expect(searchTerms('huiles bio')).toEqual(['huile', 'bio'])
  })

  // Stripping the "s" from "frais" would give "frai", which drags in
  // strawberries; from "pois" it would give "poi", which drags in pepper and
  // fish.
  it('laisse tranquilles les mots qui finissent en « s » sans être pluriels', () => {
    expect(searchTerms('pois')).toEqual(['pois'])
    expect(searchTerms('piment frais')).toEqual(['piment', 'frais'])
    expect(searchTerms('ananas jus')).toEqual(['ananas', 'jus'])
  })

  it('retire aussi le pluriel en « x » : « choux » trouve « Chou »', () => {
    expect(searchTerms('choux')).toEqual(['chou'])
  })

  // Every word is required in the product name: keeping "avec" meant looking
  // for a product called "avec".
  it('écarte les mots de liaison', () => {
    expect(searchTerms('du gari avec de l huile')).toEqual(['gari', 'huile'])
  })

  it('garde les mots de liaison quand il n\'y a qu\'eux', () => {
    expect(searchTerms('les')).toEqual(['les'])
  })

  // The original scenario: "je cherche du gari avec de l'huile rouge". No
  // product carries the word "rouge" — it is palm oil.
  it('traduit le vocabulaire d\'ici : « huile rouge » est de l\'huile de palme', () => {
    expect(searchTerms('huile rouge')).toEqual(['huile', 'palme'])
    expect(searchTerms('gari et huiles rouges')).toEqual(['gari', 'huile', 'palme'])
  })
})

// The assistant searched "tomate 2 kg" and returned nothing, while the
// catalogue carries "Tomates fraiches bio". Since every word is required in
// the name, "2" and "kg" doomed the query.
it('écarte la quantité et son unité', () => {
  expect(searchTerms('tomate 2 kg')).toEqual(['tomate'])
  expect(searchTerms('2 litres d huile')).toEqual(['huile'])
  expect(searchTerms('500 g de gari')).toEqual(['gari'])
})
