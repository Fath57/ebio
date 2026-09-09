import type { AuditEntry } from '../utils/users-queries'
import { useTranslation } from 'react-i18next'
import { formatRelative } from '@/features/admin/deliveries/utils/deliveries-queries'

interface AuditTimelineProps {
  entries: AuditEntry[]
  /** Show the target type (team-wide listing) rather than assuming the current user. */
  showTarget?: boolean
}

export function AuditTimeline({ entries, showTarget = false }: AuditTimelineProps) {
  const { t, i18n } = useTranslation()

  if (entries.length === 0)
    return <p className="text-sm text-muted-foreground">{t('admin.users.audit.empty')}</p>

  return (
    <ol className="space-y-4 border-l pl-4">
      {entries.map((entry) => {
        const until = typeof entry.payload?.until === 'string' ? entry.payload.until : null
        return (
          <li key={entry.id} className="relative text-sm">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">
                {t(`admin.users.audit.${entry.action}`, { defaultValue: entry.action })}
              </span>
              {showTarget && (
                <span className="text-xs text-muted-foreground">
                  {t(`admin.users.audit.targetTypes.${entry.targetType}`, { defaultValue: entry.targetType })}
                </span>
              )}
              <span className="text-xs text-muted-foreground" title={new Date(entry.createdAt).toLocaleString(i18n.language)}>
                {formatRelative(entry.createdAt, i18n.language)}
              </span>
            </div>
            <p className="text-muted-foreground">
              {t('admin.users.audit.by', { name: entry.actor?.name ?? '—' })}
              {until && ` · ${t('admin.users.audit.until', { date: new Date(until).toLocaleDateString(i18n.language) })}`}
            </p>
            {entry.reason && <p className="mt-1 italic">{entry.reason}</p>}
          </li>
        )
      })}
    </ol>
  )
}
