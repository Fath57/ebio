import type { ColumnDef } from '@boilerstone/ui/components/primitives/data-table'
import type { FarProof } from '../utils/deliveries-queries'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ImageOff } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AdminListShell } from '@/features/admin/common/components/admin-list-shell'
import { useListParams } from '@/features/admin/common/utils/use-list-params'
import { FAR_PROOFS_PAGE_SIZE, fetchFarProofsQueryOptions, formatDistance } from '../utils/deliveries-queries'

/** Thumbnail of the hand-over photo, opened full size in a new tab. */
function ProofThumbnail({ url, alt, noPhotoLabel }: { url: string | null, alt: string, noPhotoLabel: string }) {
  if (!url) {
    return (
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-md" title={noPhotoLabel}>
        <ImageOff className="h-4 w-4" aria-hidden />
        <span className="sr-only">{noPhotoLabel}</span>
      </span>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block size-14 shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={event => event.stopPropagation()}
    >
      <img src={url} alt={alt} loading="lazy" className="size-14 rounded-md object-cover" />
    </a>
  )
}

/**
 * Hand-over photos of deliveries to a relative taken far from the drop-off
 * point (FR-036). Nothing is blocked at delivery time: the staff checks them
 * here, newest first, and opens the order when one looks wrong.
 */
export default function FarProofsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const list = useListParams({ defaultSort: 'deliveredAt' })

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    ...fetchFarProofsQueryOptions(list.page),
    placeholderData: keepPreviousData,
  })

  const columns = useMemo<Array<ColumnDef<FarProof, unknown>>>(() => [
    {
      id: 'photo',
      header: t('admin.deliveries.farProofs.columns.photo'),
      enableSorting: false,
      cell: ({ row }) => (
        <ProofThumbnail
          url={row.original.photoUrl}
          alt={t('admin.orders.proof.photoAlt', { number: row.original.orderNumber })}
          noPhotoLabel={t('admin.orders.proof.noPhoto')}
        />
      ),
    },
    {
      id: 'distance',
      header: t('admin.deliveries.farProofs.columns.distance'),
      enableSorting: false,
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className="font-mono font-medium">
          {row.original.distanceM === null ? '—' : formatDistance(row.original.distanceM, i18n.language)}
        </span>
      ),
    },
    {
      id: 'courier',
      header: t('admin.deliveries.farProofs.columns.courier'),
      enableSorting: false,
      meta: { wrap: true },
      cell: ({ row }) => row.original.courierId
        ? (
            <Link
              to={`/admin/livreurs/${row.original.courierId}`}
              className="text-ebio-blue-600 underline-offset-4 hover:underline dark:text-ebio-blue-200"
              onClick={event => event.stopPropagation()}
            >
              {row.original.courierName ?? t('admin.deliveries.noCourier')}
            </Link>
          )
        : <span className="text-muted-foreground">{t('admin.deliveries.noCourier')}</span>,
    },
    {
      id: 'order',
      header: t('admin.deliveries.farProofs.columns.order'),
      enableSorting: false,
      cell: ({ row }) => (
        <Link
          to={`/admin/commandes/${row.original.orderId}`}
          className="font-mono font-medium text-ebio-blue-600 underline-offset-4 hover:underline dark:text-ebio-blue-200"
          onClick={event => event.stopPropagation()}
        >
          {row.original.orderNumber}
        </Link>
      ),
    },
    {
      id: 'deliveredAt',
      header: t('admin.deliveries.farProofs.columns.date'),
      enableSorting: false,
      meta: { hideBelow: 'sm' },
      cell: ({ row }) => {
        const iso = row.original.takenAt ?? row.original.deliveredAt
        if (!iso)
          return <span className="text-muted-foreground">—</span>
        const date = new Date(iso)
        return (
          <span className="flex flex-col">
            <span>{date.toLocaleDateString(i18n.language)}</span>
            <span className="text-muted-foreground text-xs">
              {date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        )
      },
    },
  ], [t, i18n.language])

  return (
    <AdminListShell
      title={t('admin.deliveries.farProofs.title')}
      description={t('admin.deliveries.farProofs.description')}
      columns={columns}
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={list.page}
      pageSize={FAR_PROOFS_PAGE_SIZE}
      onPageChange={list.setPage}
      onRowClick={proof => navigate(`/admin/commandes/${proof.orderId}`)}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      onRetry={() => refetch()}
      emptyLabel={t('admin.deliveries.farProofs.empty')}
    />
  )
}
