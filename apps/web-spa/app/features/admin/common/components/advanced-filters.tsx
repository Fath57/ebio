import type { ActiveFilter } from './admin-list-shell'
import type { FilterOption } from './filter-select'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { cn } from '@boilerstone/ui/lib/utils'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterSelect } from './filter-select'

/** One field of the panel; `key` is its URL parameter. */
export type AdvancedFilterField
  = | { kind: 'min', key: string, label: string, unit?: string, step?: number }
    | { kind: 'select', key: string, label: string, options: FilterOption[], allLabel: string }
    | { kind: 'date', key: string, label: string }

interface AdvancedFiltersProps {
  fields: AdvancedFilterField[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}

function formatNumber(value: string, locale: string): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString(locale).replace(/\u202F/g, '\u00A0') : value
}

/**
 * The filters that do not fit the toolbar, behind one button that says how
 * many are on. Sits in the toolbar's wrapping row: open, the panel takes a
 * full line of its own under the search.
 */
export function AdvancedFilters({ fields, values, onChange }: AdvancedFiltersProps) {
  const { t } = useTranslation()
  const activeCount = fields.filter(field => values[field.key]).length
  const [open, setOpen] = useState(activeCount > 0)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn('h-10 gap-2', activeCount > 0 && 'border-primary')}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t('dataTable.moreFilters')}
        {activeCount > 0 && (
          <span className="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium">
            {activeCount}
          </span>
        )}
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </Button>
      {open && (
        <div className="bg-muted/30 grid w-full gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`filter-${field.key}`} className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                {field.label}
              </Label>
              {field.kind === 'select' && (
                <FilterSelect
                  value={values[field.key] ?? ''}
                  onValueChange={value => onChange(field.key, value)}
                  allLabel={field.allLabel}
                  ariaLabel={field.label}
                  options={field.options}
                  className="w-full"
                />
              )}
              {field.kind === 'date' && (
                <Input
                  id={`filter-${field.key}`}
                  type="date"
                  className="h-10"
                  value={values[field.key] ?? ''}
                  onChange={event => onChange(field.key, event.target.value)}
                />
              )}
              {field.kind === 'min' && (
                <MinimumInput field={field} value={values[field.key] ?? ''} onCommit={value => onChange(field.key, value)} />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * A « at least » number. Typing stays local; the list only reloads on Enter
 * or when the field is left, one request per figure, not per digit.
 */
function MinimumInput({ field, value, onCommit }: { field: Extract<AdvancedFilterField, { kind: 'min' }>, value: string, onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== value)
      onCommit(trimmed === '' || Number(trimmed) < 0 ? '' : trimmed)
  }
  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">≥</span>
      <Input
        id={`filter-${field.key}`}
        type="number"
        min={0}
        step={field.step ?? 1}
        inputMode="numeric"
        className={cn('h-10 pl-8', field.unit && 'pr-16')}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter')
            commit()
        }}
      />
      {field.unit && (
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">{field.unit}</span>
      )}
    </div>
  )
}

/** The chips of the active advanced filters, worded for reading: « Commandes ≥ 3 ». */
export function advancedFilterChips(
  fields: AdvancedFilterField[],
  values: Record<string, string>,
  onRemove: (key: string) => void,
  locale: string,
): ActiveFilter[] {
  const chips: ActiveFilter[] = []
  for (const field of fields) {
    const value = values[field.key]
    if (!value)
      continue
    let shown = value
    if (field.kind === 'min')
      shown = `≥ ${formatNumber(value, locale)}${field.unit ? `\u00A0${field.unit}` : ''}`
    else if (field.kind === 'select')
      shown = field.options.find(option => option.value === value)?.label ?? value
    else
      shown = new Date(`${value}T12:00:00`).toLocaleDateString(locale)
    chips.push({ key: field.key, group: field.label, value: shown, onRemove: () => onRemove(field.key) })
  }
  return chips
}
