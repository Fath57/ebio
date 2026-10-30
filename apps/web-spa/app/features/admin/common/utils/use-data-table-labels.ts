import type { DataTableLabels } from '@boilerstone/ui/components/primitives/data-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/** Every generic `DataTable` string, translated once; only the empty message varies per list. */
export function useDataTableLabels(empty: string): DataTableLabels {
  const { t, i18n } = useTranslation()

  return useMemo(() => {
    const format = (value: number) => value.toLocaleString(i18n.language)
    return {
      empty,
      error: t('dataTable.error'),
      retry: t('dataTable.retry'),
      range: (from, to, total) => t('dataTable.range', { from: format(from), to: format(to), total: format(total), count: total }),
      previous: t('dataTable.previous'),
      next: t('dataTable.next'),
      first: t('dataTable.first'),
      last: t('dataTable.last'),
      pagination: t('dataTable.pagination'),
    }
  }, [empty, t, i18n.language])
}
