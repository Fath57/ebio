import type { ExportPack, ExportPackInput, ExportPackScope } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Card, CardContent } from '@boilerstone/ui/components/primitives/card'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Tabs, TabsList, TabsTrigger } from '@boilerstone/ui/components/primitives/tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Pencil, Plus, RotateCcw, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/features/admin/common/components/confirm-dialog'
import { ProductThumb } from '@/features/admin/common/components/product-thumb'
import { StatusBadge } from '@/features/admin/common/components/status-badge'
import { StatusTabs } from '@/features/admin/common/components/status-tabs'
import { formatAmount } from '@/features/admin/wallets/utils/format-amount'
import { Can } from '@/lib/casl/can'
import { CriteriaList } from '../components/criteria-list'
import { PackBalance } from '../components/pack-balance'
import { ExportStatusBadge } from '../components/terroir-status-badges'
import { PackFormDialog } from '../forms/pack-form-dialog'
import { WithdrawDialog } from '../forms/withdraw-dialog'
import { formatDateTime } from '../utils/terroir-format'
import { packsQueryOptions, reinstatePack, retirePack, savePack, terroirKeys, withdrawPack } from '../utils/terroir-queries'
import { EXPORT_PACK_STATUSES } from '../utils/terroir-types'

type Editing
  = | { kind: 'form', pack: ExportPack | null }
    | { kind: 'retire', pack: ExportPack }
    | { kind: 'withdraw', pack: ExportPack }

function isScope(value: string): value is ExportPackScope {
  return value === 'ebio' || value === 'all'
}

/**
 * The packs of the Valise du pays: eBio's own, composed from several shops
 * (the pack price is eBio's call, each shop is still paid its own price),
 * and the shops' packs. A pack is exportable by itself once it meets its
 * criteria; eBio can withdraw any pack, with a reason, and reinstate it.
 */
export default function ExportPacksPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<ExportPackScope>('ebio')
  const [statusTab, setStatusTab] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const packs = useQuery(packsQueryOptions(scope))

  const all = packs.data ?? []
  const shown = statusTab ? all.filter(pack => pack.status === statusTab) : all
  const counts = packs.data
    ? Object.fromEntries(EXPORT_PACK_STATUSES.map(value => [value, all.filter(pack => pack.status === value).length]))
    : undefined

  const close = () => {
    setEditing(null)
    setError(null)
  }

  const succeed = (message: string) => {
    queryClient.invalidateQueries({ queryKey: terroirKeys.packsRoot })
    toast.success(message)
    close()
  }

  const onFailure = (failure: Error) => setError(failure.message || t('admin.terroir.genericError'))

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null, input: ExportPackInput }) => savePack(id, input),
    onMutate: () => setError(null),
    onSuccess: () => succeed(t('admin.terroir.packs.saved')),
    onError: onFailure,
  })

  const retireMutation = useMutation({
    mutationFn: (id: string) => retirePack(id),
    onMutate: () => setError(null),
    onSuccess: () => succeed(t('admin.terroir.packs.retired')),
    onError: onFailure,
  })

  const withdrawMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string, reason: string }) => withdrawPack(id, reason),
    onMutate: () => setError(null),
    onSuccess: () => succeed(t('admin.terroir.packs.withdrawn')),
    onError: onFailure,
  })

  const reinstateMutation = useMutation({
    mutationFn: (id: string) => reinstatePack(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: terroirKeys.packsRoot })
      toast.success(t('admin.terroir.packs.reinstated'))
    },
    onError: (failure: Error) => toast.error(failure.message || t('admin.terroir.genericError')),
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

      <Tabs
        value={scope}
        onValueChange={(value) => {
          if (isScope(value))
            setScope(value)
        }}
      >
        <TabsList aria-label={t('admin.terroir.packs.scopeLabel')}>
          <TabsTrigger value="ebio">{t('admin.terroir.packs.scope.ebio')}</TabsTrigger>
          <TabsTrigger value="all">{t('admin.terroir.packs.scope.all')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <StatusTabs
        tabs={EXPORT_PACK_STATUSES.map(value => ({
          value,
          label: t(`admin.terroir.exportStatus.${value}`),
          tone: value === 'WITHDRAWN' ? 'problem' : undefined,
        }))}
        value={statusTab}
        onChange={setStatusTab}
        counts={counts}
      />

      {packs.isError && (
        <div className="space-y-2" role="alert">
          <p className="text-destructive">{t('admin.terroir.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => packs.refetch()}>{t('common.retry')}</Button>
        </div>
      )}
      {packs.isLoading && <Skeleton className="h-48 w-full" />}
      {packs.data && shown.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            {scope === 'ebio' ? t('admin.terroir.packs.empty') : t('admin.terroir.packs.emptyAll')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map(pack => (
          <PackCard
            key={pack.id}
            pack={pack}
            reinstating={reinstateMutation.isPending && reinstateMutation.variables === pack.id}
            onEdit={() => setEditing({ kind: 'form', pack })}
            onRetire={() => setEditing({ kind: 'retire', pack })}
            onWithdraw={() => setEditing({ kind: 'withdraw', pack })}
            onReinstate={() => reinstateMutation.mutate(pack.id)}
          />
        ))}
      </div>

      {editing?.kind === 'form' && (
        <PackFormDialog
          pack={editing.pack}
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
      {editing?.kind === 'withdraw' && (
        <WithdrawDialog
          title={t('admin.terroir.packs.withdrawTitle', { name: editing.pack.name })}
          description={editing.pack.shopName
            ? t('admin.terroir.packs.withdrawDescription', { shop: editing.pack.shopName })
            : t('admin.terroir.packs.withdrawDescriptionEbio')}
          isPending={withdrawMutation.isPending}
          error={error}
          onClose={close}
          onSubmit={reason => withdrawMutation.mutate({ id: editing.pack.id, reason })}
        />
      )}
    </div>
  )
}

interface PackCardProps {
  pack: ExportPack
  reinstating: boolean
  onEdit: () => void
  onRetire: () => void
  onWithdraw: () => void
  onReinstate: () => void
}

function PackCard({ pack, reinstating, onEdit, onRetire, onWithdraw, onReinstate }: PackCardProps) {
  const { t } = useTranslation()
  const shops = new Set(pack.items.map(item => item.shopName))
  const isEbio = pack.supplierId == null
  const retired = pack.status === 'RETIRED'
  const withdrawn = pack.status === 'WITHDRAWN'

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-4">
          <ProductThumb url={pack.photos[0] ?? pack.items[0]?.imageUrl ?? null} size={64} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{pack.name}</p>
              <ExportStatusBadge status={pack.status} />
              {!retired && (
                <StatusBadge tone={pack.orderable ? 'done' : 'idle'}>
                  {pack.orderable ? t('admin.terroir.packs.orderable') : t('admin.terroir.packs.notOrderable')}
                </StatusBadge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {`${pack.shopName ?? t('admin.terroir.packs.byEbio')} · ${t('admin.terroir.packs.shopCount', { count: shops.size })}`}
            </p>
          </div>
          {isEbio && !retired && (
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

        {withdrawn && (
          <div
            role="note"
            className="border-ebio-coral-200 bg-ebio-coral-50 text-ebio-coral-600 dark:border-ebio-coral-800 dark:bg-ebio-coral-900 dark:text-ebio-coral-100 space-y-1 rounded-md border p-3 text-sm"
          >
            <p className="font-medium">{t('admin.terroir.packs.withdrawnOn', { date: formatDateTime(pack.withdrawnAt) })}</p>
            {pack.withdrawnReason && <p>{pack.withdrawnReason}</p>}
          </div>
        )}

        {!retired && pack.missingCount > 0 && (
          <div className="space-y-2">
            <p className="text-ebio-earth-800 dark:text-ebio-earth-100 text-sm font-medium">
              {t('admin.terroir.control.missing', { count: pack.missingCount })}
            </p>
            <CriteriaList criteria={pack.criteria} unmetOnly />
          </div>
        )}

        <ul className="divide-y">
          {pack.items.map(item => (
            <li key={`${item.productId}-${item.variantId ?? ''}`} className="flex items-center gap-3 py-2">
              <ProductThumb url={item.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{`${item.quantity} × ${item.name}`}</p>
                <p className="text-muted-foreground text-xs">{`${item.shopName} · ${formatAmount(item.unitPrice)}`}</p>
              </div>
              {item.exportStatus !== 'EXPORTABLE' && (
                item.exportStatus
                  ? <ExportStatusBadge status={item.exportStatus} />
                  : <StatusBadge tone="action">{t('admin.terroir.packs.itemNotOffered')}</StatusBadge>
              )}
            </li>
          ))}
        </ul>
        <PackBalance price={pack.price} linesTotal={pack.linesTotal} />

        {!retired && (
          <Can action="manage" subject="Product">
            <div className="flex justify-end">
              {withdrawn
                ? (
                    <Button variant="outline" size="sm" onClick={onReinstate} disabled={reinstating}>
                      <RotateCcw className="mr-1 h-4 w-4" />
                      {reinstating ? t('common.saving') : t('admin.terroir.packs.reinstate')}
                    </Button>
                  )
                : (
                    <Button variant="outline" size="sm" onClick={onWithdraw}>
                      <Undo2 className="mr-1 h-4 w-4" />
                      {t('admin.terroir.packs.withdraw')}
                    </Button>
                  )}
            </div>
          </Can>
        )}
      </CardContent>
    </Card>
  )
}
