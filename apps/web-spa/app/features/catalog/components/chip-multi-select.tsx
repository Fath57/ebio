import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface ChipOption {
  /** Value stored in the form */
  value: string
  /** Human-readable chip text */
  label: string
}

interface ChipMultiSelectProps {
  /** Currently selected values */
  value: string[]
  onChange: (next: string[]) => void
  /** Closed vocabulary rendered as toggleable chips */
  options: ChipOption[]
  /** Maximum number of selected items */
  maxItems: number
  /**
   * Whether the user may type values outside `options`.
   * Defaults to true; pass false for canonical-code fields.
   */
  allowCustom?: boolean
  /** Maximum length of a free-entry item (only used when `allowCustom`) */
  maxItemLength?: number
}

/**
 * Chip multi-select: toggleable option chips, plus an optional free-entry
 * input. Values that are not part of `options` (free entries, or legacy data
 * on a closed field) appear as removable badges so they can always be cleared.
 */
export function ChipMultiSelect({
  value,
  onChange,
  options,
  maxItems,
  allowCustom = true,
  maxItemLength = 50,
}: ChipMultiSelectProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')

  const knownValues = options.map(option => option.value)
  const customValues = value.filter(v => !knownValues.includes(v))
  const isFull = value.length >= maxItems

  function toggle(item: string) {
    if (value.includes(item)) {
      onChange(value.filter(v => v !== item))
    }
    else if (!isFull) {
      onChange([...value, item])
    }
  }

  function addDraft() {
    const trimmed = draft.trim().slice(0, maxItemLength)
    if (!trimmed)
      return
    if (!value.includes(trimmed) && !isFull)
      onChange([...value, trimmed])
    setDraft('')
  }

  return (
    <div className="space-y-3">
      {/* Closed vocabulary */}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              disabled={!selected && isFull}
              aria-pressed={selected}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : isFull
                    ? 'border-border text-muted-foreground opacity-40 cursor-not-allowed'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {selected && <Check className="h-3.5 w-3.5" />}
              {option.label}
            </button>
          )
        })}
      </div>

      {/* Values outside the vocabulary (free entries or legacy data) */}
      {customValues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customValues.map(item => (
            <Badge key={item} variant="secondary" className="gap-1 pr-1">
              {item}
              <button
                type="button"
                aria-label={t('catalog.composition.removeItem')}
                onClick={() => toggle(item)}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Free entry */}
      {allowCustom && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addDraft()
              }
            }}
            maxLength={maxItemLength}
            placeholder={t('catalog.composition.customPlaceholder')}
            disabled={isFull}
            className="max-w-xs"
          />
          <Button type="button" variant="outline" size="sm" onClick={addDraft} disabled={isFull || !draft.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            {t('catalog.composition.addCustom')}
          </Button>
        </div>
      )}
    </div>
  )
}
