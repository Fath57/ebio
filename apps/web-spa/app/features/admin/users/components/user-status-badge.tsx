import type { UserStatus } from '../utils/users-queries'
import { Badge } from '@boilerstone/ui/components/primitives/badge'
import { useTranslation } from 'react-i18next'

interface UserStatusBadgeProps {
  status: UserStatus
  isBlocked: boolean
  suspendedUntil: string | null
}

/** Effective standing of an account: an expired suspension shows as active. */
export function UserStatusBadge({ status, isBlocked, suspendedUntil }: UserStatusBadgeProps) {
  const { t, i18n } = useTranslation()

  if (!isBlocked)
    return <Badge variant="default">{t('admin.users.status.active')}</Badge>

  if (status === 'BANNED')
    return <Badge variant="destructive">{t('admin.users.status.banned')}</Badge>

  if (suspendedUntil) {
    const date = new Date(suspendedUntil).toLocaleDateString(i18n.language)
    return <Badge variant="secondary">{t('admin.users.status.suspendedUntil', { date })}</Badge>
  }

  return <Badge variant="secondary">{t('admin.users.status.suspended')}</Badge>
}
