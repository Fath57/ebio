import type { FamilyMemberStatus, FamilyWalletStatus } from '../utils/family-wallets-queries'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/features/admin/common/components/status-badge'

const WALLET_TONES: Record<FamilyWalletStatus, StatusTone> = {
  ACTIVE: 'done',
  SUSPENDED: 'action',
  CLOSED: 'idle',
}

const MEMBER_TONES: Record<FamilyMemberStatus, StatusTone> = {
  PENDING: 'progress',
  ACTIVE: 'done',
  SUSPENDED: 'action',
  REMOVED: 'idle',
}

/** The wallet's state, and who suspended it when it is eBio. */
export function FamilyWalletStatusBadge({ status, suspendedByAdmin }: { status: FamilyWalletStatus, suspendedByAdmin: boolean }) {
  const { t } = useTranslation()
  const label = status === 'SUSPENDED' && suspendedByAdmin
    ? t('admin.familyWallets.status.SUSPENDED_BY_EBIO')
    : t(`admin.familyWallets.status.${status}`)
  return <StatusBadge tone={WALLET_TONES[status]}>{label}</StatusBadge>
}

/** A member's state; an eBio suspension says so, since only staff can lift it. */
export function FamilyMemberStatusBadge({ status, suspendedByAdmin }: { status: FamilyMemberStatus, suspendedByAdmin: boolean }) {
  const { t } = useTranslation()
  const label = status === 'SUSPENDED' && suspendedByAdmin
    ? t('admin.familyWallets.memberStatus.SUSPENDED_BY_EBIO')
    : t(`admin.familyWallets.memberStatus.${status}`)
  return <StatusBadge tone={MEMBER_TONES[status]}>{label}</StatusBadge>
}
