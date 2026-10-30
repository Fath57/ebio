import type { UserStatus } from '../utils/users-queries'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/features/admin/common/components/status-badge'

interface UserStatusBadgeProps {
  status: UserStatus
  isBlocked: boolean
  suspendedUntil: string | null
}

/** Effective standing of an account: an expired suspension shows as active. */
export function UserStatusBadge({ status, isBlocked, suspendedUntil }: UserStatusBadgeProps) {
  const { t, i18n } = useTranslation()

  if (!isBlocked)
    return <StatusBadge tone="done">{t('admin.users.status.active')}</StatusBadge>

  if (status === 'BANNED')
    return <StatusBadge tone="problem">{t('admin.users.status.banned')}</StatusBadge>

  if (suspendedUntil) {
    const date = new Date(suspendedUntil).toLocaleDateString(i18n.language)
    return <StatusBadge tone="problem">{t('admin.users.status.suspendedUntil', { date })}</StatusBadge>
  }

  return <StatusBadge tone="problem">{t('admin.users.status.suspended')}</StatusBadge>
}
