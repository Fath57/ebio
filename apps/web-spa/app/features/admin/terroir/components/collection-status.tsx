import type { ExportShopCollection } from '../utils/terroir-types'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { Copy, Truck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatMoment } from '../utils/terroir-format'

/** Courier run statuses during which a courier is heading to the shop or to the hub. */
const ON_THE_WAY = new Set(['AWAITING_COURIER', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])
/** Statuses in which the parcel can be declared received at the hub by the staff. */
const RECEIVABLE = new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'])

/** True when the staff may confirm the courier's drop-off without the code. */
export function canReceiveAtHub(collection: ExportShopCollection | null): collection is ExportShopCollection & { deliveryId: string } {
  return collection?.mode === 'COURIER'
    && collection.deliveryId != null
    && collection.receivedAt == null
    && RECEIVABLE.has(collection.status ?? '')
}

interface CollectionStatusProps {
  collection: ExportShopCollection | null
}

/**
 * Where a shop's orders stand on their way to the eBio hub: who brings them,
 * when the courier took them, and the code the hub staff hand over.
 */
export function CollectionStatus({ collection }: CollectionStatusProps) {
  const { t } = useTranslation()

  const courier = (() => {
    const name = collection?.courierName ?? t('admin.terroir.collection.courierUnknown')
    return collection?.courierPhone ? `${name} (${collection.courierPhone})` : name
  })()

  const line = (() => {
    if (!collection)
      return t('admin.terroir.collection.statusNone')
    if (collection.mode === 'EBIO')
      return t('admin.terroir.collection.statusEbio')
    if (collection.receivedAt || collection.status === 'DELIVERED')
      return t('admin.terroir.collection.statusReceived', { time: formatMoment(collection.receivedAt) })
    if (collection.status === 'FAILED')
      return t('admin.terroir.collection.statusFailed')
    if (collection.status === 'CANCELLED')
      return t('admin.terroir.collection.statusCancelled')
    if (collection.pickedUpAt || collection.status === 'PICKED_UP' || collection.status === 'IN_TRANSIT')
      return t('admin.terroir.collection.statusPickedUp', { courier, time: formatMoment(collection.pickedUpAt) })
    if (collection.status === 'ACCEPTED')
      return t('admin.terroir.collection.statusAccepted', { courier })
    return t('admin.terroir.collection.statusAwaiting')
  })()

  const showCode = collection?.mode === 'COURIER'
    && collection.hubCode != null
    && collection.receivedAt == null
    && ON_THE_WAY.has(collection.status ?? '')

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success(t('admin.terroir.collection.codeCopied'))
    }
    catch {
      toast.error(t('admin.terroir.collection.copyFailed'))
    }
  }

  const Icon = collection?.mode === 'EBIO' ? Users : Truck

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{line}</span>
      </p>
      {showCode && collection?.hubCode && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">{t('admin.terroir.collection.hubCode')}</span>
          <span className="bg-ebio-blue-50 text-ebio-blue-800 dark:bg-ebio-blue-900 dark:text-ebio-blue-100 rounded-full px-3 py-0.5 font-mono text-sm font-semibold tracking-widest">
            {collection.hubCode}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('admin.terroir.collection.copyCode')}
            title={t('admin.terroir.collection.copyCode')}
            onClick={() => copyCode(collection.hubCode ?? '')}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-muted-foreground basis-full text-xs">{t('admin.terroir.collection.hubCodeHint')}</span>
        </div>
      )}
    </div>
  )
}
