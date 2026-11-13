import type { SettingsSection, SettingsSectionId } from '../utils/settings-registry'
import { cn } from '@boilerstone/ui/lib/utils'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

interface SettingsNavProps {
  sections: readonly SettingsSection[]
  /** Settings the viewer can see, per section. */
  counts: Readonly<Record<SettingsSectionId, number>>
  /** Null while a search spans every section. */
  activeSection: SettingsSectionId | null
  /** Called when a section is picked — the page clears its search then. */
  onNavigate: () => void
}

/**
 * Sections of the settings page. A vertical list beside the content on a
 * desktop, a row of chips that scrolls sideways on a phone. Each entry is a
 * link (`?section=…`), so back and forward walk through the sections.
 */
export function SettingsNav({ sections, counts, activeSection, onNavigate }: SettingsNavProps) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('admin.settings.sections.navLabel')} className="-mx-4 sm:-mx-6 lg:mx-0">
      <ul className="flex gap-2 overflow-x-auto px-4 pb-1 sm:px-6 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
        {sections.map((section) => {
          const isActive = section.id === activeSection
          const Icon = section.icon
          const count = counts[section.id]
          return (
            <li key={section.id} className="shrink-0">
              <Link
                to={{ search: `?section=${section.id}` }}
                aria-current={isActive ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'relative flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors lg:min-h-10 lg:gap-3 lg:rounded-lg lg:border-transparent lg:px-3',
                  'focus-visible:ring-ebio-green-400 focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none',
                  isActive
                    ? 'border-ebio-green-200 bg-ebio-green-50 text-ebio-green-800 dark:border-ebio-green-800 dark:bg-ebio-green-900 dark:text-ebio-green-100'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground border-border',
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="lg:flex-1">{t(`admin.settings.sections.${section.id}.title`)}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-2 text-xs leading-5 tabular-nums',
                      isActive
                        ? 'bg-ebio-green-100 text-ebio-green-800 dark:bg-ebio-green-800 dark:text-ebio-green-100'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <span aria-hidden="true">{count}</span>
                    <span className="sr-only">{t('admin.settings.sections.count', { count })}</span>
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
