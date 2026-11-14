import type { ExportCriterion } from '../utils/terroir-types'
import { cn } from '@boilerstone/ui/lib/utils'
import { CircleCheck, CircleX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface CriteriaListProps {
  criteria: ExportCriterion[]
  /** Only the criteria not met, for a compact card. */
  unmetOnly?: boolean
  className?: string
}

/**
 * The export criteria, met or not, as the API words them. An unmet criterion
 * carries its hint: what the shop must do, which is also what eBio tells it.
 */
export function CriteriaList({ criteria, unmetOnly = false, className }: CriteriaListProps) {
  const { t } = useTranslation()
  const shown = unmetOnly ? criteria.filter(criterion => !criterion.met) : criteria

  return (
    <ul className={cn('space-y-2', className)}>
      {shown.map(criterion => (
        <li key={criterion.key} className="flex items-start gap-2 text-sm">
          {criterion.met
            ? <CircleCheck className="text-ebio-green-600 dark:text-ebio-green-200 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            : <CircleX className="text-ebio-earth-600 dark:text-ebio-earth-100 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <div className="min-w-0">
            <p className={criterion.met ? undefined : 'font-medium'}>
              <span className="sr-only">{criterion.met ? t('admin.terroir.criteria.met') : t('admin.terroir.criteria.unmet')}</span>
              {criterion.label}
            </p>
            {!criterion.met && <p className="text-muted-foreground text-xs">{criterion.hint}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}
