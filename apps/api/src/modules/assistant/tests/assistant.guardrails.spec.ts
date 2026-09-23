import type { RecordedToolCall } from '../tools/assistant-tool'
import {
  amountsIn,
  forSpeech,
  groundingBreaches,
  isTurnTooLong,
  machineTells,
  sentenceCount,
  ungroundedAmounts,
} from '../assistant.guardrails'

function toolCall(result: unknown): RecordedToolCall {
  return { name: 'chercher_produits', args: {}, result, ms: 1 }
}

describe('montants prononcés', () => {
  it('lit les milliers écrits avec une espace', () => {
    expect(amountsIn('Son gari blanc, c\'est 1 500 le kilo.')).toEqual([1500])
  })

  it('lit aussi l\'espace insécable, que la synthèse produit', () => {
    expect(amountsIn('Ça fait 5 500 pour l\'instant.')).toEqual([5500])
  })

  // « deux kilos » n'est pas un prix : confondre les deux ferait échouer
  // chaque tour où l'assistant répète une quantité.
  it('ignore les petits nombres, qui sont des quantités', () => {
    expect(amountsIn('Deux kilos, c\'est noté.')).toEqual([])
  })
})

describe('ancrage des montants', () => {
  const tools = [toolCall({ produits: [{ nom: 'Gari blanc', prix: 1500 }] })]

  it('accepte un prix rendu par un outil', () => {
    expect(ungroundedAmounts('Le gari blanc, c\'est 1 500 le kilo.', tools)).toEqual([])
  })

  // Le défaut qui compte : un modèle qui additionne lui-même. Il tombe juste
  // souvent, et faux le jour où une promotion s'applique.
  it('refuse un total que nul outil n\'a rendu', () => {
    expect(ungroundedAmounts('Ça nous fait 3 000 en tout.', tools)).toEqual([3000])
  })

  it('trouve les montants au fond d\'une réponse imbriquée', () => {
    const nested = [toolCall({ commande: { livraison: { frais: 1000 } } })]
    expect(ungroundedAmounts('La livraison est à 1 000.', nested)).toEqual([])
  })

  it('n\'accepte rien quand aucun outil n\'a été appelé', () => {
    expect(ungroundedAmounts('Le riz est à 2 000 le kilo.', [])).toEqual([2000])
  })
})

describe('longueur d\'un tour', () => {
  it('laisse passer trois phrases', () => {
    const reply = 'Du gari, d\'accord. J\'ai le blanc à 1 500 le kilo. Je vous en mets ?'
    expect(sentenceCount(reply)).toBe(3)
    expect(isTurnTooLong(reply)).toBe(false)
  })

  // C'était la première rédaction de la spec : à lire ça passe, à l'oreille
  // on décroche à la moitié.
  it('refuse le paragraphe qu\'on ne peut pas écouter', () => {
    const reply = [
      'J\'ai du gari chez deux boutiques : du gari blanc à 1 500 le kilo chez Mama Adjo, et du gari Sohui à 1 800 chez Fidjrossè Bio.',
      'Pour l\'huile rouge, Mama Adjo a une bouteille d\'un litre à 2 500.',
      'Si vous prenez tout chez elle, ça vous fait une seule livraison.',
      'Je vous mets ça ?',
    ].join(' ')
    expect(isTurnTooLong(reply)).toBe(true)
  })
})

describe('ce qui trahit la machine', () => {
  it('repère l\'assistant qui nomme ses propres actions', () => {
    expect(machineTells('Je vais maintenant ajouter cet article à votre panier.')).toHaveLength(1)
  })

  it('repère l\'annonce du nombre d\'options', () => {
    expect(machineTells('J\'ai trouvé trois options pour vous.')).toHaveLength(1)
  })

  it('repère le vouvoiement administratif', () => {
    expect(machineTells('Souhaitez-vous que je procède à l\'ajout ?')).toHaveLength(1)
  })

  it('laisse passer une vraie phrase de marché', () => {
    expect(machineTells('Deux kilos, c\'est noté. Je vous mets l\'huile aussi ?')).toEqual([])
  })
})

/**
 * Ce que l'invite demande mais ne garantit pas.
 *
 * Trouvés en poussant l'assistant : il a annoncé « 1 600, livraison comprise »
 * sans avoir rien calculé, et mis des astérisques autour d'un nom de boutique.
 */
describe('vérification d\'une réponse', () => {
  const searched: RecordedToolCall[] = [
    { name: 'chercher_produits', args: {}, ms: 1, result: { produits: [{ nom: 'Gari', prix: 800 }] } },
  ]

  it('laisse passer un montant qu\'un outil a rendu', () => {
    expect(groundingBreaches('C\'est 800 le kilo.', searched)).toEqual([])
  })

  it('reprend un total que personne n\'a calculé', () => {
    const breaches = groundingBreaches('Ça fait 1 600 en tout.', searched)
    expect(breaches).toHaveLength(1)
    expect(breaches[0].what).toContain('1600')
  })

  // Le prix d'un produit trouvé deux tours plus tôt reste légitime : sans
  // cette mémoire, l'alarme sonnerait à chaque phrase d'une conversation.
  it('accepte un montant vu plus tôt dans la conversation', () => {
    expect(groundingBreaches('Je vous avais dit 2 500 le litre.', [], [2500])).toEqual([])
  })

  it('reprend « livraison comprise » quand rien ne l\'a calculée', () => {
    const breaches = groundingBreaches('Ça fait 800, livraison comprise.', searched)
    expect(breaches.map(breach => breach.what)).toContain('livraison annoncée comprise sans frais calculés')
  })

  it('accepte « livraison comprise » quand les frais sont connus', () => {
    const estimated: RecordedToolCall[] = [
      { name: 'estimer_commande', args: {}, ms: 1, result: { total: 1800, livraison: 1000 } },
    ]
    expect(groundingBreaches('Ça fait 1 800, livraison comprise.', estimated)).toEqual([])
  })
})

describe('mise en voix', () => {
  it('retire ce qui ne s\'entend pas', () => {
    expect(forSpeech('L\'une chez **Huiles Bio Koffi**, elle est en livraison.'))
      .toBe('L\'une chez Huiles Bio Koffi, elle est en livraison.')
  })

  it('aplatit une liste écrite', () => {
    expect(forSpeech('## Vos commandes\n- du gari\n- de l\'huile')).toBe('Vos commandes\ndu gari\ndu l\'huile'.replace('du l\'huile', 'de l\'huile'))
  })

  // « 2 * 3 » ou une apostrophe ne doivent pas être pris pour du balisage.
  it('ne touche pas au texte ordinaire', () => {
    expect(forSpeech('Il reste 2 * 3 kilos, c\'est tout.')).toBe('Il reste 2 * 3 kilos, c\'est tout.')
  })
})
