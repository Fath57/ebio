import { AssistantService } from '../assistant.service'

/**
 * Ce que l'assistant sait faire, et surtout ce qu'il ne sait pas.
 *
 * Le service est construit avec des dépendances vides : on n'interroge ici
 * que la liste des outils, pas leur exécution.
 */
function toolset() {
  const service = new AssistantService({} as never, {} as never, {} as never, {} as never)
  return (service as unknown as { toolset: () => Array<{ name: string, description: string }> }).toolset()
}

describe('outils de l\'assistant', () => {
  // La garantie centrale de la spec 008. L'absence est le garde-fou : une
  // consigne d'invite se contourne, un outil qui n'existe pas ne s'appelle
  // pas. Ce test rend l'absence permanente, y compris contre le prochain
  // développeur qui trouverait pratique d'ajouter `payer()`.
  it('ne comporte aucun outil touchant au paiement', () => {
    const forbidden = /pay|paiement|regler|régler|debit|débit|carte|mobile_money/i
    const offenders = toolset().filter(t => forbidden.test(t.name))
    expect(offenders.map(t => t.name)).toEqual([])
  })

  it('expose la recherche, le panier, l\'estimation et le suivi', () => {
    const names = toolset().map(t => t.name)
    expect(names).toContain('chercher_produits')
    expect(names).toContain('ajouter_au_panier')
    expect(names).toContain('estimer_commande')
    expect(names).toContain('statut_commande')
  })

  // Le seul autorisé à produire un montant global. S'il disparaissait, le
  // modèle additionnerait de lui-même sans que rien ne l'en empêche.
  it('garde estimer_commande comme unique source des totaux', () => {
    const estimate = toolset().find(t => t.name === 'estimer_commande')
    expect(estimate).toBeDefined()
    expect(estimate?.description).toMatch(/jamais additionner soi-même/i)
  })

  // La tentation la plus naturelle d'un modèle de langage, et la plus chère
  // en confiance : annoncer une heure d'arrivée qu'il ne connaît pas.
  it('interdit explicitement l\'estimation d\'un délai dans le suivi', () => {
    const status = toolset().find(t => t.name === 'statut_commande')
    expect(status?.description).toMatch(/jamais estimer un délai/i)
  })

  it('nomme ses outils en français, la langue de la conversation', () => {
    expect(toolset().every(t => /^[a-z_]+$/.test(t.name))).toBe(true)
    expect(toolset().map(t => t.name)).not.toContain('search_products')
  })
})
