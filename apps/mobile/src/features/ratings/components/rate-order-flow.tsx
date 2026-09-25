import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useTheme } from '../../../theme/theme-context'
import { apiFetch } from '../../../utils/api-client'
import { appAlert } from '../../common/components/app-alert'
import { ScreenHeader } from '../../common/components/screen-header'
import { RateCourierScreen } from '../../deliveries/components/rate-courier-screen'
import { RatingForm } from './rating-form'

interface RateOrderFlowProps {
  orderId: string
  supplierId: string
  /** The shop review already exists: the flow starts at the courier. */
  hasReview: boolean
  /** Courier already rated, the buyer only wants to leave a tip. */
  tipOnly?: boolean
  onDone: () => void
  onBack: () => void
  onOpenWallet: () => void
}

interface DeliveryFeedbackState {
  id: string
  status: string
  courier: { name: string } | null
  tipAmount: number
  buyerRating: { rating: number } | null
}

type Step = 'loading' | 'shop' | 'courier' | 'tip'

/**
 * Rating an order, at delivery: the shop (four criteria), then the courier
 * (stars and a tip). Steps already done, or moot when the shop delivered
 * itself, are skipped.
 *
 * The products are no longer here. They used to be rated at the moment the
 * parcel arrives — so before anything had been tasted, and the review was
 * about the packaging. The ask now goes out hours later, by notification, to a
 * screen that does nothing else.
 */
export function RateOrderFlow({ orderId, supplierId, hasReview, tipOnly = false, onDone, onBack, onOpenWallet }: RateOrderFlowProps) {
  const { semantic } = useTheme()
  const [delivery, setDelivery] = useState<DeliveryFeedbackState | null>(null)
  const [step, setStep] = useState<Step>('loading')

  useEffect(() => {
    let cancelled = false
    async function load() {
      let found: DeliveryFeedbackState | null = null
      try {
        // 404 = no platform courier on this order (shop delivered itself).
        const res = await apiFetch(`/api/deliveries/by-order/${orderId}`)
        if (res.ok)
          found = await res.json() as DeliveryFeedbackState
      }
      catch {
        // Offline: the shop review still works, the courier step is skipped.
      }
      if (cancelled)
        return
      setDelivery(found)
      const courierDone = found?.status === 'DELIVERED' && found.courier !== null
      if (tipOnly)
        setStep(courierDone ? 'tip' : 'shop')
      else if (!hasReview)
        setStep('shop')
      else if (courierDone && !found?.buyerRating)
        setStep('courier')
      else if (courierDone && found?.tipAmount === 0)
        setStep('tip')
      else
        onDone()
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orderId, hasReview, tipOnly, onDone])

  const courierPending = delivery?.status === 'DELIVERED' && delivery.courier !== null && !delivery.buyerRating

  function handleShopDone(): void {
    if (courierPending) {
      setStep('courier')
      return
    }
    appAlert('Merci !', 'Votre avis a été enregistré.')
    onDone()
  }

  if (step === 'loading') {
    return (
      <View style={[styles.loading, { backgroundColor: semantic.bgPage }]}>
        <ActivityIndicator />
      </View>
    )
  }

  if (step === 'shop') {
    return (
      <>
        <ScreenHeader title={courierPending ? 'Noter ma commande · 1/2' : 'Noter la boutique'} onBack={onBack} />
        <RatingForm
          supplierId={supplierId}
          orderId={orderId}
          transactionType="ORDER"
          title="Comment était la boutique ?"
          silent
          onComplete={handleShopDone}
        />
      </>
    )
  }

  return (
    <RateCourierScreen
      deliveryId={delivery!.id}
      courierName={delivery!.courier?.name ?? 'Livreur'}
      mode={step === 'tip' ? 'tip' : 'rate'}
      onDone={onDone}
      onBack={onBack}
      onOpenWallet={onOpenWallet}
    />
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
