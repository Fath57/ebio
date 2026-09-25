import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@boilerstone/ui/components/primitives/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@boilerstone/ui/components/primitives/popover'
import { Check, ChevronsUpDown, ImageOff, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Leaves time to finish a word before hitting the server. */
const DEBOUNCE_MS = 250

export interface PickerOption {
  id: string
  label: string
  /** Second line: the shop a product belongs to, a neighbourhood for a shop. */
  context?: string | null
  imageUrl?: string | null
}

interface EntityPickerProps {
  value: string
  placeholder: string
  searchPlaceholder: string
  emptyLabel: string
  /** Called on every debounced keystroke, and once on open with an empty query. */
  onSearch: (query: string) => Promise<PickerOption[]>
  onSelect: (option: PickerOption) => void
  /** Shown when a value is set but the list has not been searched yet. */
  selected?: PickerOption | null
}

function OptionAvatar({ option }: { option: PickerOption }) {
  if (option.imageUrl) {
    return <img src={option.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
  }
  return (
    <span className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded">
      <ImageOff className="h-4 w-4" />
    </span>
  )
}

/**
 * Searchable picker for a supplier or a product.
 *
 * Replaces the free-text identifier field the banner form used to carry: an
 * editor picking what to feature should recognise it by name and picture, not
 * paste a UUID copied from elsewhere.
 */
export function EntityPicker({
  value,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  onSearch,
  onSelect,
  selected,
}: EntityPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PickerOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await onSearch(query)
        if (!cancelled) {
          setOptions(results)
        }
      }
      catch {
        if (!cancelled) {
          setOptions([])
        }
      }
      finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query, onSearch])

  const current = selected ?? options.find(option => option.id === value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto w-full justify-between py-2"
        >
          {current
            ? (
                <span className="flex min-w-0 items-center gap-2">
                  <OptionAvatar option={current} />
                  <span className="min-w-0 text-left">
                    <span className="block truncate font-medium">{current.label}</span>
                    {current.context
                      ? <span className="text-muted-foreground block truncate text-xs">{current.context}</span>
                      : null}
                  </span>
                </span>
              )
            : <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        {/* The server already filters, so the built-in fuzzy matching would only
            hide results it never saw the query for. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading
              ? (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.loading')}
                  </div>
                )
              : <CommandEmpty>{emptyLabel}</CommandEmpty>}
            <CommandGroup>
              {options.map(option => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  onSelect={() => {
                    onSelect(option)
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  <OptionAvatar option={option} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.context
                      ? <span className="text-muted-foreground block truncate text-xs">{option.context}</span>
                      : null}
                  </span>
                  {option.id === value && <Check className="h-4 w-4 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
