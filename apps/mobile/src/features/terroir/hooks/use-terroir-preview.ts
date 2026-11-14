import type { TerroirCheckoutInput, TerroirPreview } from '../terroir-api'
import { useEffect, useState } from 'react'
import { previewTerroirCheckout } from '../terroir-api'

const DEBOUNCE_MS = 400

interface TerroirPreviewState {
  preview: TerroirPreview | null
  loading: boolean
  error: string | null
  errorCode: string | null
}

/**
 * The server's pricing of the parcel: weight, billed minimum, margin,
 * departures and totals. Asked again, debounced, whenever the input changes;
 * a null input (empty basket) asks nothing.
 */
export function useTerroirPreview(input: TerroirCheckoutInput | null): TerroirPreviewState {
  const [state, setState] = useState<TerroirPreviewState>({ preview: null, loading: input !== null, error: null, errorCode: null })
  const key = input ? JSON.stringify(input) : null

  useEffect(() => {
    if (!key) {
      setState({ preview: null, loading: false, error: null, errorCode: null })
      return
    }
    let cancelled = false
    setState(current => ({ ...current, loading: true }))
    const timer = setTimeout(() => {
      previewTerroirCheckout(JSON.parse(key) as TerroirCheckoutInput)
        .then((preview) => {
          if (!cancelled)
            setState({ preview, loading: false, error: null, errorCode: null })
        })
        .catch((error: unknown) => {
          if (cancelled)
            return
          const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null
          setState(current => ({
            preview: current.preview,
            loading: false,
            error: error instanceof Error ? error.message : 'Impossible de calculer votre colis.',
            errorCode: code,
          }))
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key])

  return state
}
