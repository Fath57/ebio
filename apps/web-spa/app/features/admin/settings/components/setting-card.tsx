import type { SettingDefinition } from '../utils/settings-registry'
import type { AdminSettingsState } from '../utils/use-admin-settings'
import { Card, CardContent, CardHeader } from '@boilerstone/ui/components/primitives/card'
import { useTranslation } from 'react-i18next'
import { Can } from '@/lib/casl/can'

interface SettingCardProps {
  setting: SettingDefinition
  state: AdminSettingsState
  /** Shown above the title in search results, where cards from every section mix. */
  showSection?: boolean
}

function SettingCardBody({ setting, state, showSection = false }: SettingCardProps) {
  const { t } = useTranslation()
  const values = setting.i18nValues?.(state) ?? {}
  const summary = setting.summary?.(state, t)
  const Icon = setting.icon
  const titleId = `${setting.id}-titre`

  return (
    <Card id={setting.id} aria-labelledby={titleId} className="scroll-mt-24" asChild>
      <section>
        <CardHeader className="gap-2">
          {showSection && (
            <p className="text-ebio-green-600 dark:text-ebio-green-200 text-xs font-semibold uppercase tracking-widest">
              {t(`admin.settings.sections.${setting.section}.title`)}
            </p>
          )}
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="bg-ebio-green-50 text-ebio-green-600 dark:bg-ebio-green-900 dark:text-ebio-green-200 flex size-9 shrink-0 items-center justify-center rounded-lg"
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h4 id={titleId} className="text-base leading-snug font-semibold">
                {t(setting.titleKey, values)}
              </h4>
              <p className="text-muted-foreground text-sm">{t(setting.descriptionKey, values)}</p>
              {summary
                ? (
                    <p className="pt-1 text-sm">
                      <span className="text-muted-foreground">
                        {t('admin.settings.summary.label')}
                      </span>
                      {' '}
                      <span className="text-foreground font-medium">{summary}</span>
                    </p>
                  )
                : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>{setting.render(state)}</CardContent>
      </section>
    </Card>
  )
}

/**
 * One setting: what it is, what it changes, its current value, then its form.
 * The `<Can>` guard is the one the card carried before the page was split.
 */
export function SettingCard(props: SettingCardProps) {
  if (!props.setting.adminOnly)
    return <SettingCardBody {...props} />
  return (
    <Can action="manage" subject="all">
      <SettingCardBody {...props} />
    </Can>
  )
}
