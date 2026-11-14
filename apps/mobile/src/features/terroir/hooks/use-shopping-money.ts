import type { FormattedMoney } from '../../common/hooks/use-money'
import { useMoney } from '../../common/hooks/use-money'
import { useValiseMode } from '../valise-mode-context'
import { useTerroirMoney } from './use-terroir-money'

/**
 * The money formatter of the shopping screens: the buyer's currency as usual,
 * the destination's currency (FCFA under it) while the Valise mode is on.
 */
export function useShoppingMoney(): (xof: number) => FormattedMoney {
  const { active } = useValiseMode()
  const { formatMoney } = useMoney()
  const { formatMoney: formatTerroir } = useTerroirMoney()
  return active ? formatTerroir : formatMoney
}
