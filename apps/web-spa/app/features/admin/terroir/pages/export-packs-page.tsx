import type { ExportPack, ExportPackInput } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { ProductThumb } from '@/features/admin/common/components/product-thumb'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { Can } from '@/lib/casl/can'
import { PackBalance } from '../components/pack-balance'
import { ReviewStatusBadge } from '../components/terroir-status-badges'
import { PackFormDialog } from '../forms/pack-form-dialog'
import { packsQueryOptions, retirePack, reviewsQueryOptions, savePack, terroirKeys } from '../utils/terroir-queries'

type Editing
  = | { kind: 'form', pack: ExportPack | null }
    | { kind: 'retire', pack: ExportPack }

/**
 * Packs composed by eBio from several shops. The pack price is eBio's call:
 * each shop is still paid its own price, so the page always shows the gap.
 */
export default function ExportPacksPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const packs = useQuery(packsQueryOptions())
  const approved = useQuery(reviewsQueryOptions('APPROVED'))

  const ebioPacks = (packs.data ?? []).filter(pack => pack.supplierId == null)

  const close = () => {
    setEditing(null)
    setError(null)
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: terroirKeys.packs })
    queryClient.invalidateQueries({ queryKey: terroirKeys.reviewsRoot })
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null, input: ExportPackInput }) => savePack(id, input),
    onMutate: () => setError(null),
    onSuccess: () => {
      invalidate()
      toast.success(t('admin.terroir.packs.saved'))
      close()
    },
    onError: (failure: Error) => setError(failure.message || t('admin.terroir.genericError')),
  })

  const retireMutation = useMutation({
    mutationFn: (id: string) => retirePack(id),
    onMutate: () => setError(null),
    onSuccess: () => {
      invalidate()
      toast.success(t('admin.terroir.packs.retired'))
      close()
    },
    onError: (failure: Error) => setError(failure.message || t('admin.terroir.genericError')),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t('admin.terroir.packs.title')}</h2>
          <p className="text-muted-foreground">{t('admin.terroir.packs.description')}</p>
        </div>
        <Can action="manage" subject="Product">
          <Button onClick={() => setEditing({ kind: 'form', pack: null })}>
            <Plus className="mr-1 h-4 w-4" />
            {t('admin.terroir.packs.create')}
          </Button>
        </Can>
      </div>

      {packs.isError && (
        <div className="space-y-2" role="alert">
          <p className="text-destructive">{t('admin.terroir.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => packs.refetch()}>{t('common.retry')}</Button>
        </div>
      )}
      {packs.isLoading && <Skeleton className="h-48 w-full" />}
      {packs.data && ebioPacks.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">{t('admin.terroir.packs.empty')}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {ebioPacks.map(pack => (
          <PackCard
            key={pack.id}
            pack={pack}
            onEdit={() => setEditing({ kind: 'form', pack })}
            onRetire={() => setEditing({ kind: 'retire', pack })}
          />
        ))}
      </div>

      {editing?.kind === 'form' && (
        <PackFormDialog
          pack={editing.pack}
          approved={approved.data?.products ?? []}
          isPending={saveMutation.isPending}
          error={error}
          onClose={close}
          onSubmit={input => saveMutation.mutate({ id: editing.pack?.id ?? null, input })}
        />
      )}
      {editing?.kind === 'retire' && (
        <ConfirmDialog
          open
          destructive
          onOpenChange={(open) => {
            if (!open)
              close()
          }}
          title={t('admin.terroir.packs.retireTitle', { name: editing.pack.name })}
          description={t('admin.terroir.packs.retireDescription')}
          confirmLabel={t('admin.terroir.packs.retire')}
          isPending={retireMutation.isPending}
          error={error}
          onConfirm={() => retireMutation.mutate(editing.pack.id)}
        />
      )}
    </div>
  )
}

interface PackCardProps {
  pack: ExportPack
  onEdit: () => void
  onRetire: () => void
}

function PackCard({ pack, onEdit, onRetire }: PackCardProps) {
  const { t } = useTranslation()
  const shops = new Set(pack.items.map(item => item.shopName))

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-4">
          <ProductThumb url={pack.photos[0] ?? pack.items[0]?.imageUrl ?? null} size={64} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{pack.name}</p>
              <ReviewStatusBadge status={pack.status} />
              {pack.status !== 'RETIRED' && (
                <StatusBadge tone={pack.orderable ? 'done' : 'action'}>
                  {pack.orderable ? t('admin.terroir.packs.orderable') : t('admin.terroir.packs.notOrderable')}
                </StatusBadge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">{t('admin.terroir.packs.shopCount', { count: shops.size })}</p>
          </div>
          {pack.status !== 'RETIRED' && (
            <Can action="manage" subject="Product">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" aria-label={t('admin.terroir.packs.editAria', { name: pack.name })} onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" aria-label={t('admin.terroir.packs.retireAria', { name: pack.name })} onClick={onRetire}>
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </Can>
          )}
        </div>
        <ul className="divide-y">
          {pack.items.map(item => (
            <li key={`${item.productId}-${item.variantId ?? ''}`} className="flex items-center gap-3 py-2">
              <ProductThumb url={item.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{`${item.quantity} × ${item.name}`}</p>
                <p className="text-muted-foreground text-xs">{`${item.shopName} · ${formatAmount(item.unitPrice)}`}</p>
              </div>
              {item.exportStatus !== 'APPROVED' && (
                <StatusBadge tone="problem">{t('admin.terroir.packs.itemNotApproved')}</StatusBadge>
              )}
            </li>
          ))}
        </ul>
        <PackBalance price={pack.price} linesTotal={pack.linesTotal} />
      </CardContent>
    </Card>
  )
}
