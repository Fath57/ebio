import { useTerroirCountries, useTerroirEnabled } from '../terroir-api'
import { BoardingPass } from './valise/boarding-pass'

interface TerroirHomeEntryProps {
  onPress: () => void
}

const MAX_NAMED_COUNTRIES = 3

/** « en France et en Belgique », « en France, en Belgique, au Canada et ailleurs », else « à l’étranger ». */
export function servedPlaces(inPhrases: string[]): string {
  if (inPhrases.length === 0)
    return 'à l’étranger'
  const named = inPhrases.slice(0, MAX_NAMED_COUNTRIES)
  const parts = inPhrases.length > MAX_NAMED_COUNTRIES ? [...named, 'ailleurs'] : named
  if (parts.length === 1)
    return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1] ?? ''}`
}

/** The home screen's way into the Valise mode (a boarding pass); hidden while the module is off. */
export function TerroirHomeEntry({ onPress }: TerroirHomeEntryProps) {
  const enabled = useTerroirEnabled()
  const countries = useTerroirCountries(false, enabled)
  if (!enabled)
    return null
  return <BoardingPass places={servedPlaces((countries ?? []).map(country => country.inPhrase))} onPress={onPress} />
}
