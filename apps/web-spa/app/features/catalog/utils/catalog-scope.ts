import { useSearchParams } from 'react-router'
import { useAbility } from '@/lib/casl/ability-context'

/**
 * The shop whose catalogue is being worked on, carried in the URL.
 *
 * In the URL rather than in a store so a refresh, a bookmark or a link sent to
 * a colleague all land on the same shop — and so the address bar always says
 * whose catalogue is open, which a hidden state could not.
 */
export const SHOP_PARAM = 'boutique'

export interface CatalogScope {
  /** What the API expects as `path.supplierId`: a shop id, or `me`. */
  supplierId: string
  /** The shop id when working on a shop's behalf, `null` on one's own catalogue. */
  shopId: string | null
  /** Someone from eBio is editing a shop's catalogue, not their own. */
  onBehalf: boolean
  /**
   * An eBio member with no shop of their own and none picked yet. `me` would
   * answer 404 for them, so the page asks for a shop instead of querying.
   */
  awaitingShop: boolean
}

export function useCatalogScope(): CatalogScope {
  const [params] = useSearchParams()
  const { role } = useAbility()
  const shopId = params.get(SHOP_PARAM)
  const ownsShop = role === 'SUPPLIER'

  return {
    supplierId: shopId ?? 'me',
    shopId,
    onBehalf: shopId !== null,
    awaitingShop: shopId === null && !ownsShop,
  }
}

/** Keeps the shop in the URL across every move inside the catalogue. */
export function catalogPath(path: string, shopId: string | null): string {
  if (!shopId)
    return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}${SHOP_PARAM}=${encodeURIComponent(shopId)}`
}
