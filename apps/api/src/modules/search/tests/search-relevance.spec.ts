import { buildRelevanceSelect, SearchService } from '../search.service'

function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length
}

describe('pertinence d\'une recherche', () => {
  it('lie autant de paramètres que de marqueurs', () => {
    const actual = buildRelevanceSelect('huile arachide', ['huile', 'arachide'])
    expect(countPlaceholders(actual.sql)).toBe(actual.params.length)
  })

  it('compare le nom entier, puis le début du nom au premier mot', () => {
    const actual = buildRelevanceSelect(' Tomate ', ['Tomate'])
    expect(actual.params.slice(0, 2)).toEqual(['Tomate', 'Tomate%'])
  })

  it('ne classe rien sans mot recherché', () => {
    expect(buildRelevanceSelect('', [])).toEqual({ sql: '0 AS relevance', params: [] })
  })
})

describe('vouliez-vous dire', () => {
  const baseQuery = { q: 'tomatte', latitude: 6.37, longitude: 2.39, sortBy: 'distance', page: 1, limit: 20 }

  function buildService(rowsFor: (sql: string, params: unknown[]) => unknown[]) {
    const execute = vi.fn(async (sql: string, params: unknown[] = []) => rowsFor(sql, params))
    const service = new SearchService({ getConnection: () => ({ execute }) } as never)
    return { service, execute }
  }

  it('propose le mot du catalogue quand la correction trouve des produits', async () => {
    const { service } = buildService((sql, params) => {
      if (sql.includes('vocabulary'))
        return [{ word: 'tomate', contains: false }]
      if (sql.includes('COUNT(*)'))
        return [{ count: params.includes('%tomate%') ? '2' : '0' }]
      return []
    })
    const actual = await service.searchProducts(baseQuery as never)
    expect(actual.total).toBe(0)
    expect(actual.didYouMean).toBe('tomate')
  })

  it('ne propose rien si la correction ne trouve rien non plus', async () => {
    const { service } = buildService((sql) => {
      if (sql.includes('vocabulary'))
        return [{ word: 'tomate', contains: false }]
      if (sql.includes('COUNT(*)'))
        return [{ count: '0' }]
      return []
    })
    const actual = await service.searchProducts(baseQuery as never)
    expect(actual.didYouMean).toBeNull()
  })

  it('garde un mot que le catalogue contient déjà', async () => {
    const { service, execute } = buildService((sql) => {
      if (sql.includes('vocabulary'))
        return [{ word: 'tomates', contains: true }]
      if (sql.includes('COUNT(*)'))
        return [{ count: '0' }]
      return []
    })
    const actual = await service.searchProducts({ ...baseQuery, q: 'tomate' } as never)
    expect(actual.didYouMean).toBeNull()
    // No second search: nothing was corrected.
    expect(execute.mock.calls.filter(([sql]) => sql.includes('COUNT(*)'))).toHaveLength(1)
  })
})
