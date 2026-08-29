import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../utils/api-client'

const QUEUE_KEY = 'courier_transition_queue'

interface QueuedTransition {
  deliveryId: string
  path: string
  body: Record<string, unknown>
  occurredAt: string
}

async function readQueue(): Promise<QueuedTransition[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY)
  return raw ? JSON.parse(raw) as QueuedTransition[] : []
}

async function writeQueue(queue: QueuedTransition[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export interface TransitionResult {
  ok: boolean
  queued: boolean
  status?: number
  errorMessage?: string
}

/**
 * Offline-first status transitions: a network failure stores the action with
 * its real timestamp (`occurredAt`) and the queue replays sequentially when
 * connectivity returns. Business errors (4xx) are never queued — the server
 * already saw and refused them.
 */
export function useOfflineQueue(onFlushed?: () => void) {
  const [pendingCount, setPendingCount] = useState(0)

  const flush = useCallback(async () => {
    const queue = await readQueue()
    if (queue.length === 0) {
      return
    }
    const remaining = [...queue]
    while (remaining.length > 0) {
      const next = remaining[0]
      try {
        const res = await apiFetch(next.path, {
          method: 'POST',
          body: JSON.stringify({ ...next.body, occurredAt: next.occurredAt }),
        })
        if (!res.ok && res.status >= 500) {
          break
        }
        // 2xx applied; 4xx definitively refused — drop it either way.
        remaining.shift()
      }
      catch {
        break
      }
    }
    await writeQueue(remaining)
    setPendingCount(remaining.length)
    if (remaining.length === 0) {
      onFlushed?.()
    }
  }, [onFlushed])

  useEffect(() => {
    readQueue().then((queue) => {
      setPendingCount(queue.length)
    })
    const unsubscribe = NetInfo.addEventListener((netState) => {
      if (netState.isConnected) {
        flush()
      }
    })
    return unsubscribe
  }, [flush])

  const sendTransition = useCallback(async (
    deliveryId: string,
    action: 'pickup' | 'start' | 'complete' | 'fail',
    body: Record<string, unknown> = {},
  ): Promise<TransitionResult> => {
    const path = `/api/deliveries/${deliveryId}/${action}`
    const occurredAt = new Date().toISOString()
    try {
      const res = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ ...body, occurredAt }),
      })
      if (res.ok) {
        return { ok: true, queued: false, status: res.status }
      }
      if (res.status >= 500) {
        const queue = await readQueue()
        queue.push({ deliveryId, path, body, occurredAt })
        await writeQueue(queue)
        setPendingCount(queue.length)
        return { ok: false, queued: true, status: res.status }
      }
      const data = await res.json().catch(() => ({})) as { message?: string }
      return { ok: false, queued: false, status: res.status, errorMessage: data.message }
    }
    catch {
      const queue = await readQueue()
      queue.push({ deliveryId, path, body, occurredAt })
      await writeQueue(queue)
      setPendingCount(queue.length)
      return { ok: false, queued: true }
    }
  }, [])

  return { sendTransition, pendingCount, flush }
}
