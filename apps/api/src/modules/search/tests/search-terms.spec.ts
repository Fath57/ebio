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

  // « deux piments » ne trouvait pas « Piment frais local », et l'assistant
  // annonçait une rupture qui n'existait pas.
  it('retire le pluriel, pour que « piments » trouve « Piment »', () => {
    expect(searchTerms('piments')).toEqual(['piment'])
    expect(searchTerms('huiles bio')).toEqual(['huile', 'bio'])
  })

  // Couper le « s » de « frais » donnerait « frai », qui ramène les fraises ;
  // celui de « pois » donnerait « poi », qui ramène le poivre et le poisson.
  it('laisse tranquilles les mots qui finissent en « s » sans être pluriels', () => {
    expect(searchTerms('pois')).toEqual(['pois'])
    expect(searchTerms('piment frais')).toEqual(['piment', 'frais'])
    expect(searchTerms('ananas jus')).toEqual(['ananas', 'jus'])
  })

  it('retire aussi le pluriel en « x » : « choux » trouve « Chou »', () => {
    expect(searchTerms('choux')).toEqual(['chou'])
  })

  // Chaque mot est exigé dans le nom du produit : garder « avec » revenait à
  // chercher un produit qui s'appelle « avec ».
  it('écarte les mots de liaison', () => {
    expect(searchTerms('du gari avec de l huile')).toEqual(['gari', 'huile'])
  })

  it('garde les mots de liaison quand il n\'y a qu\'eux', () => {
    expect(searchTerms('les')).toEqual(['les'])
  })

  // Le scénario d'origine : « je cherche du gari avec de l'huile rouge ».
  // Aucun produit ne porte le mot « rouge » — c'est l'huile de palme.
  it('traduit le vocabulaire d\'ici : « huile rouge » est de l\'huile de palme', () => {
    expect(searchTerms('huile rouge')).toEqual(['huile', 'palme'])
    expect(searchTerms('gari et huiles rouges')).toEqual(['gari', 'huile', 'palme'])
  })
})
