import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { AdminTopup } from '../utils/wallets-queries'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { History } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { formatAmount } from '../utils/format-amount'

export const TOPUP_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const

export const TOPUP_TONES: Record<string, StatusTone> = {
  PENDING: 'progress',
  COMPLETED: 'done',
  FAILED: 'problem',
}

/**
 * Columns of a topup list: who paid, how much, whether the provider confirmed it.
 * With `withWalletLink`, a last column opens the wallet that was credited.
 */
export function useTopupColumns({ withWalletLink }: { withWalletLink: boolean }) {
  const { t, i18n } = useTranslation()

  return useMemo<Array<ColumnDef<AdminTopup, unknown>>>(() => [
    {
      id: 'createdAt',
      header: t('admin.wallets.columns.date'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(i18n.language),
    },
    {
      id: 'user',
      header: t('admin.wallets.columns.payer'),
      cell: ({ row }) => (
        <span className="flex flex-col">
          <Link to={`/admin/utilisateurs/${row.original.userId}`} className="font-medium hover:underline">
            {row.original.userName || '—'}
          </Link>
          {row.original.userEmail && <span className="text-muted-foreground text-xs">{row.original.userEmail}</span>}
        </span>
      ),
    },
    {
      id: 'reference',
      header: t('admin.wallets.columns.reference'),
      meta: { hideBelow: 'md' },
      cell: ({ row }) => <span className="text-muted-foreground font-mono text-xs">{row.original.fedapayTransactionId ?? '—'}</span>,
    },
    {
      id: 'amount',
      header: t('admin.wallets.columns.amount'),
      meta: { numeric: true },
      cell: ({ row }) => <span className="font-medium">{formatAmount(row.original.amount)}</span>,
    },
    {
      id: 'status',
      header: t('admin.wallets.columns.status'),
      cell: ({ row }) => (
        <StatusBadge tone={TOPUP_TONES[row.original.status] ?? 'idle'}>
          {t(`admin.wallets.topupStatus.${row.original.status}`)}
        </StatusBadge>
      ),
    },
    ...(withWalletLink
      ? [{
        id: 'wallet',
        header: '',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/admin/portefeuilles/${row.original.walletId}`}>
              <History className="mr-1 h-4 w-4" />
              {t('admin.wallets.history')}
            </Link>
          </Button>
        ),
      } satisfies ColumnDef<AdminTopup, unknown>]
      : []),
  ], [t, i18n.language, withWalletLink])
}
