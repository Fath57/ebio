import type { ExportDepartureStatus, ExportPackStatus, ExportShipmentStatus } from '../utils/terroir-types'
import type { StatusTone } from '@/features/admin/common/components/status-badge'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '@/features/admin/common/components/status-badge'

const DEPARTURE_TONES: Record<ExportDepartureStatus, StatusTone> = {
  OPEN: 'progress',
  FULL: 'action',
  CANCELLED: 'idle',
  DEPARTED: 'done',
}

const SHIPMENT_TONES: Record<ExportShipmentStatus, StatusTone> = {
  PENDING_PAYMENT: 'idle',
  PAID: 'action',
  COLLECTING: 'action',
  PACKED: 'action',
  DROPPED_AT_AGENCY: 'progress',
  DEPARTED: 'progress',
  ARRIVED: 'progress',
  READY_FOR_PICKUP: 'progress',
  OUT_FOR_DELIVERY: 'progress',
  HANDED_OVER: 'done',
  LOST: 'problem',
  DAMAGED: 'problem',
  CANCELLED: 'idle',
}

const EXPORT_TONES: Record<ExportPackStatus, StatusTone> = {
  EXPORTABLE: 'done',
  INCOMPLETE: 'action',
  WITHDRAWN: 'problem',
  RETIRED: 'idle',
}

export function DepartureStatusBadge({ status }: { status: ExportDepartureStatus }) {
  const { t } = useTranslation()
  return <StatusBadge tone={DEPARTURE_TONES[status]}>{t(`admin.terroir.departureStatus.${status}`)}</StatusBadge>
}

export function ShipmentStatusBadge({ status }: { status: ExportShipmentStatus }) {
  const { t } = useTranslation()
  return <StatusBadge tone={SHIPMENT_TONES[status]}>{t(`admin.terroir.shipmentStatus.${status}`)}</StatusBadge>
}

/** Export state of a product or a pack, computed from its criteria or set by eBio. */
export function ExportStatusBadge({ status }: { status: ExportPackStatus }) {
  const { t } = useTranslation()
  return <StatusBadge tone={EXPORT_TONES[status]}>{t(`admin.terroir.exportStatus.${status}`)}</StatusBadge>
}
