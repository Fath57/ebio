import NetInfo from '@react-native-community/netinfo'
import { storage } from './offline-storage'

interface QueuedAction {
  id: string
  method: string
  path: string
  body?: unknown
  createdAt: number
}

const QUEUE_KEY = 'offline_action_queue'

export const SyncManager = {
  async isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch()
    return state.isConnected === true
  },

  enqueueAction(action: Omit<QueuedAction, 'id' | 'createdAt'>): void {
    const queue = this.getQueue()
    queue.push({
      ...action,
      id: Math.random().toString(36).substring(2),
      createdAt: Date.now(),
    })
    storage.set(QUEUE_KEY, JSON.stringify(queue))
  },

  getQueue(): QueuedAction[] {
    const raw = storage.getString(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  },

  clearQueue(): void {
    storage.set(QUEUE_KEY, JSON.stringify([]))
  },

  async replayQueue(
    fetcher: (path: string, options: RequestInit) => Promise<Response>,
  ): Promise<{ succeeded: number, failed: number }> {
    const queue = this.getQueue()
    if (queue.length === 0)
      return { succeeded: 0, failed: 0 }

    let succeeded = 0
    let failed = 0
    const remaining: QueuedAction[] = []

    for (const action of queue) {
      try {
        const res = await fetcher(action.path, {
          method: action.method,
          body: action.body ? JSON.stringify(action.body) : undefined,
        })

        if (res.ok) {
          succeeded++
        }
        else if (res.status === 409) {
          // Conflict — server wins, discard local action
          succeeded++
        }
        else {
          remaining.push(action)
          failed++
        }
      }
      catch {
        remaining.push(action)
        failed++
      }
    }

    storage.set(QUEUE_KEY, JSON.stringify(remaining))
    return { succeeded, failed }
  },

  startListening(
    fetcher: (path: string, options: RequestInit) => Promise<Response>,
  ): () => void {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected) {
        await this.replayQueue(fetcher)
      }
    })
    return unsubscribe
  },
}
