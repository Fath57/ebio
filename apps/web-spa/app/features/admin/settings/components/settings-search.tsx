import { Input } from '@boilerstone/ui/components/primitives/input'
import { Label } from '@boilerstone/ui/components/primitives/label'
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SettingsSearchProps {
  value: string
  onChange: (value: string) => void
}

const INPUT_ID = 'settings-search'

/** Finds a setting across every section by its title, its description or a usual word for it. */
export function SettingsSearch({ value, onChange }: SettingsSearchProps) {
  const { t } = useTranslation()

  return (
    <div role="search" className="space-y-2">
      <Label htmlFor={INPUT_ID}>{t('admin.settings.search.label')}</Label>
      <div className="relative">
        <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2" />
        <Input
          id={INPUT_ID}
          type="search"
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape')
              onChange('')
          }}
          placeholder={t('admin.settings.search.placeholder')}
          autoComplete="off"
          className="h-12 pr-12 pl-10 focus-visible:ring-ebio-green-400 lg:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('admin.settings.search.clear')}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ebio-green-400 absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
