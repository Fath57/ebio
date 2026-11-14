import type { TFunction } from 'i18next'
import type { ExportCountryAdmin, ExportCountryCode } from './terroir-types'
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { countriesQueryOptions, TerroirApiError } from './terroir-queries'

/** The refusals tied to a destination country, explained in the staff's language. */
const COUNTRY_ERROR_CODES = new Set(['EXPORT_COUNTRY_EXISTS', 'EXPORT_COUNTRY_UNKNOWN', 'EXPORT_COUNTRY_INACTIVE'])

/** The country's name as the back office shows it, its code when the list has not loaded or misses it. */
export function countryLabel(countries: readonly ExportCountryAdmin[] | undefined, code: ExportCountryCode): string {
  const country = countries?.find(entry => entry.code === code)
  return country?.name ?? code
}

/** Active countries first, then the closed ones, each group in display order. */
export function activeFirst(countries: readonly ExportCountryAdmin[]): ExportCountryAdmin[] {
  return [...countries.filter(country => country.isActive), ...countries.filter(country => !country.isActive)]
}

/** The destination countries and a label lookup that falls back to the bare code. */
export function useExportCountries() {
  const query = useQuery(countriesQueryOptions())
  const countries = query.data
  const labelOf = useCallback((code: ExportCountryCode) => countryLabel(countries, code), [countries])
  return { ...query, countries: countries ?? [], labelOf }
}

/** A French sentence for a refusal: the country codes have their own, otherwise the API's message. */
export function terroirErrorMessage(error: Error, t: TFunction): string {
  if (error instanceof TerroirApiError && error.code && COUNTRY_ERROR_CODES.has(error.code))
    return t(`admin.terroir.countries.errors.${error.code}`)
  return error.message || t('admin.terroir.genericError')
}
