import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@boilerstone/ui/components/primitives/select'
import { cn } from '@boilerstone/ui/lib/utils'

/** Radix refuses an empty item value: "no filter" travels as this sentinel. */
const ALL = '__all__'

export interface FilterOption {
  value: string
  label: string
}

interface FilterSelectProps {
  value: string
  onValueChange: (value: string) => void
  /** Label of the unfiltered choice — « Tous les statuts ». */
  allLabel: string
  options: FilterOption[]
  ariaLabel: string
  className?: string
}

/**
 * The filter dropdown of a back-office list. An active filter gets the
 * primary border, so a narrowed list says so before anyone reads the chips.
 */
export function FilterSelect({ value, onValueChange, allLabel, options, ariaLabel, className }: FilterSelectProps) {
  return (
    <Select
      value={value || ALL}
      onValueChange={next => onValueChange(next === ALL ? '' : next)}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('h-10 w-auto min-w-44 gap-2', value && 'border-primary text-foreground', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
