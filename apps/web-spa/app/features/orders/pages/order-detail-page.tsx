import type { OrderResponse } from '../utils/orders-queries'
import { Button } from '@boilerstone/ui/components/primitives/button'
import { Skeleton } from '@boilerstone/ui/components/primitives/skeleton'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { OrderDetail } from '../components/order-detail'
import {
  acceptOrderMutationOptions,
  fetchOrderDetailQueryOptions,
  rejectOrderMutationOptions,
  updateOrderStatusMutationOptions,
} from '../utils/orders-queries'

export default function OrderDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { orderId } = useParams()

  const { data: order, isLoading } = useQuery(fetchOrderDetailQueryOptions(orderId!))

  const invalidateAndStay = () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  const { mutate: acceptOrder, isPending: isAccepting } = useMutation({
    ...acceptOrderMutationOptions,
    onSuccess: () => {
      invalidateAndStay()
      toast.success(t('orders.detail.acceptSuccess'))
    },
    onError: () => {
      toast.error(t('orders.detail.actionError'))
    },
  })

  const { mutate: rejectOrder, isPending: isRejecting } = useMutation({
    ...rejectOrderMutationOptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success(t('orders.detail.rejectSuccess'))
      navigate('/commandes')
    },
    onError: () => {
      toast.error(t('orders.detail.actionError'))
    },
  })

  const { mutate: updateStatus, isPending: isUpdatingStatus } = useMutation({
    ...updateOrderStatusMutationOptions,
    onSuccess: () => {
      invalidateAndStay()
      toast.success(t('orders.detail.statusUpdateSuccess'))
    },
    onError: () => {
      toast.error(t('orders.detail.actionError'))
    },
  })

  const isPending = isAccepting || isRejecting || isUpdatingStatus

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!order) {
    return null
  }

  const typedOrder = order as OrderResponse

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/commandes')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.back')}
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{t('orders.detail.title')}</h2>
        </div>
      </div>

      <OrderDetail
        order={typedOrder}
        onAccept={acceptOrder}
        onReject={(id: string, reason: string) => rejectOrder({ orderId: id, reason })}
        onUpdateStatus={(id, status) => updateStatus({ orderId: id, status })}
        isPending={isPending}
      />
    </div>
  )
}
