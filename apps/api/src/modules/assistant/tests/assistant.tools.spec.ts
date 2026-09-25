import { AssistantService } from '../assistant.service'

/**
 * What the assistant can do, and above all what it cannot.
 *
 * The service is built with empty dependencies: only the list of tools is
 * inspected here, never their execution.
 */
function toolset() {
  const service = new AssistantService({} as never, {} as never, {} as never, {} as never, {} as never)
  return (service as unknown as { toolset: () => Array<{ name: string, description: string }> }).toolset()
}

describe('outils de l\'assistant', () => {
  // Spec 008's central guarantee. Absence is the guardrail: a prompt
  // instruction can be talked around, a tool that does not exist cannot be
  // called. This test makes the absence permanent, including against the next
  // developer who finds it handy to add `payer()`.
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

  // The only one allowed to produce an overall amount. If it disappeared, the
  // model would add things up itself with nothing to stop it.
  it('garde estimer_commande comme unique source des totaux', () => {
    const estimate = toolset().find(t => t.name === 'estimer_commande')
    expect(estimate).toBeDefined()
    expect(estimate?.description).toMatch(/jamais additionner soi-même/i)
  })

  // A language model's most natural temptation, and the costliest in trust:
  // announcing an arrival time it does not know.
  it('interdit explicitement l\'estimation d\'un délai dans le suivi', () => {
    const status = toolset().find(t => t.name === 'statut_commande')
    expect(status?.description).toMatch(/jamais estimer un délai/i)
  })

  it('nomme ses outils en français, la langue de la conversation', () => {
    expect(toolset().every(t => /^[a-z_]+$/.test(t.name))).toBe(true)
    expect(toolset().map(t => t.name)).not.toContain('search_products')
  })
})
