import { describe, expect, it, vi } from 'vitest'
import { SearchService } from '../search.service'

function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length
}

function buildService() {
  const execute = vi.fn(async (sql: string, _params: unknown[] = []) => (sql.includes('COUNT(*)') ? [{ count: '0' }] : []))
  const service = new SearchService({ getConnection: () => ({ execute }) } as never)
  return { service, execute }
}

/** Nantes: a buyer abroad, shops in Benin. */
const fromNantes = { latitude: 47.21, longitude: -1.55, category: 'Farines et semoules ', inStockOnly: 'true', validatedOnly: 'false', promoOnly: 'false', sortBy: 'distance', page: 1, limit: 20 }

describe('portée de la recherche', () => {
  it('borne par défaut autour de la position', async () => {
    const { service, execute } = buildService()
    await service.searchProducts({ ...fromNantes, scope: 'nearby' } as never)
    const [countSql, countParams] = execute.mock.calls[0]
    expect(countSql).toContain('ST_DWithin')
    expect(countParams).toContain(-1.55)
  })

  it('lit tout le catalogue en mode Valise, sans distance ni position', async () => {
    const { service, execute } = buildService()
    await service.searchProducts({ ...fromNantes, scope: 'all' } as never)
    for (const [sql, params] of execute.mock.calls) {
      expect(sql).not.toContain('ST_DWithin')
      expect(sql).not.toContain('ST_Distance')
      expect(params).not.toContain(47.21)
      expect(countPlaceholders(sql)).toBe(params?.length ?? 0)
    }
    const dataSql = execute.mock.calls[1][0]
    expect(dataSql).toMatch(/ORDER BY EXISTS \(\s*SELECT 1 FROM export_profiles/)
  })

  it('classe la pertinence après l’exportabilité pour une recherche tapée', async () => {
    const { service, execute } = buildService()
    await service.searchProducts({ ...fromNantes, q: 'farine', scope: 'all' } as never)
    const dataSql = execute.mock.calls[1][0]
    expect(dataSql).toMatch(/'EXPORTABLE'\s*\) DESC, relevance DESC, p\.rating_avg DESC NULLS LAST/)
  })
})

describe('autocomplétion', () => {
  it('lie autant de paramètres que de marqueurs, avec ou sans position', async () => {
    for (const query of [
      { q: 'far', latitude: 6.45, longitude: 2.34, scope: 'nearby' as const },
      { q: 'far', latitude: 6.45, longitude: 2.34, scope: 'all' as const },
      { q: 'far', scope: 'nearby' as const },
    ]) {
      const { service, execute } = buildService()
      await service.autocomplete(query)
      const [sql, params] = execute.mock.calls[0]
      expect(countPlaceholders(sql)).toBe(params?.length)
      expect(sql.includes('ST_DWithin')).toBe(query.scope === 'nearby' && query.latitude !== undefined)
    }
  })
})
