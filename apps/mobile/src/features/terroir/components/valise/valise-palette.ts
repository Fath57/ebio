import { colors } from '../../../../theme/theme'
import { useTheme } from '../../../../theme/theme-context'

/**
 * The colours of « Le voyage de la valise »: kraft and leather for home,
 * sky blue for the trip, on warm paper. Green stays for the primary actions.
 */
export interface ValisePalette {
  /** Tags, passes and labels: the paper they are printed on. */
  paper: string
  /** The paper's edge and its dashed lines. */
  paperEdge: string
  /** A second, warmer surface: what fills the suitcase. */
  kraft: string
  /** Leather: eyelets, straps, strong lines. */
  leather: string
  /** Text printed on the paper. */
  ink: string
  inkSoft: string
  /** Travel blue: routes, stamps, the plane. */
  sky: string
  skyPaper: string
  skyInk: string
  /** The two inks of the airmail border. */
  stripeA: string
  stripeB: string
  /** Good news in text (green that reads on the paper). */
  positive: string
  /** The page behind: the colour of a punched hole. */
  page: string
}

export function useValisePalette(): ValisePalette {
  const { isDark, semantic } = useTheme()
  if (isDark) {
    return {
      paper: colors.earth[900],
      paperEdge: colors.earth[600],
      kraft: colors.earth[800],
      leather: colors.earth[400],
      ink: colors.earth[50],
      inkSoft: colors.earth[200],
      sky: colors.blue[200],
      skyPaper: colors.blue[900],
      skyInk: colors.blue[100],
      stripeA: colors.earth[400],
      stripeB: colors.blue[400],
      positive: colors.green[200],
      page: semantic.bgPage,
    }
  }
  return {
    paper: colors.earth[50],
    paperEdge: colors.earth[200],
    kraft: colors.earth[100],
    leather: colors.earth[400],
    ink: colors.earth[800],
    inkSoft: colors.earth[600],
    sky: colors.blue[600],
    skyPaper: colors.blue[50],
    skyInk: colors.blue[800],
    stripeA: colors.earth[400],
    stripeB: colors.blue[600],
    positive: colors.green[600],
    page: semantic.bgPage,
  }
}
