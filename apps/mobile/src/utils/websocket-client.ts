import { getSessionToken } from './api-client'

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3000'
const WS_PATH = '/ws/chat'

type ConnectionState = 'disconnected' | 'connected' | 'reconnecting'

interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  type: 'TEXT' | 'IMAGE' | 'VOICE' | 'LOCATION'
  createdAt: string
}

interface ReadReceipt {
  conversationId: string
  messageId: string
  readAt: string
}

interface TypingEvent {
  conversationId: string
  userId: string
  isTyping: boolean
}

type EventHandler<T> = (data: T) => void

interface WebSocketClientOptions {
  onMessage?: EventHandler<ChatMessage>
  onReadReceipt?: EventHandler<ReadReceipt>
  onTyping?: EventHandler<TypingEvent>
  onConnectionChange?: EventHandler<ConnectionState>
}

const MAX_RETRIES = 10
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

class WebSocketClient {
  private socket: WebSocket | null = null
  private connectionState: ConnectionState = 'disconnected'
  private retryCount = 0
  private retryTimeout: ReturnType<typeof setTimeout> | null = null
  private handlers: WebSocketClientOptions = {}

  connect(options: WebSocketClientOptions): void {
    this.handlers = options
    this.establishConnection()
  }

  disconnect(): void {
    this.clearRetryTimeout()
    this.retryCount = 0
    if (this.socket) {
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
    }
    this.updateConnectionState('disconnected')
  }

  sendMessage(conversationId: string, content: string, type: ChatMessage['type'] = 'TEXT'): void {
    this.send('chat:message', { conversationId, content, type })
  }

  sendReadReceipt(conversationId: string, messageId: string): void {
    this.send('chat:read-receipt', { conversationId, messageId })
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    this.send('chat:typing', { conversationId, isTyping })
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  private async establishConnection(): Promise<void> {
    try {
      const token = await getSessionToken()
      if (!token) {
        this.updateConnectionState('disconnected')
        return
      }

      const url = `${WS_URL}${WS_PATH}?token=${encodeURIComponent(token)}`
      this.socket = new WebSocket(url)

      this.socket.onopen = () => {
        this.retryCount = 0
        this.updateConnectionState('connected')
      }

      this.socket.onmessage = (event: WebSocketMessageEvent) => {
        try {
          const parsed = JSON.parse(event.data as string) as {
            event: string
            data: unknown
          }
          this.handleEvent(parsed.event, parsed.data)
        }
        catch {
          // Ignore malformed messages
        }
      }

      this.socket.onerror = () => {
        // Error will trigger onclose, handled there
      }

      this.socket.onclose = () => {
        this.socket = null
        this.scheduleReconnect()
      }
    }
    catch {
      this.scheduleReconnect()
    }
  }

  private handleEvent(eventName: string, data: unknown): void {
    switch (eventName) {
      case 'chat:message':
        this.handlers.onMessage?.(data as ChatMessage)
        break
      case 'chat:read-receipt':
        this.handlers.onReadReceipt?.(data as ReadReceipt)
        break
      case 'chat:typing':
        this.handlers.onTyping?.(data as TypingEvent)
        break
    }
  }

  private send(event: string, data: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, data }))
    }
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) {
      this.updateConnectionState('disconnected')
      return
    }

    this.updateConnectionState('reconnecting')
    const delay = Math.min(
      BASE_DELAY_MS * 2 ** this.retryCount,
      MAX_DELAY_MS,
    )
    this.retryCount += 1

    this.retryTimeout = setTimeout(() => {
      this.establishConnection()
    }, delay)
  }

  private clearRetryTimeout(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }
  }

  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state
    this.handlers.onConnectionChange?.(state)
  }
}

export const websocketClient = new WebSocketClient()

export type { ChatMessage, ConnectionState, ReadReceipt, TypingEvent, WebSocketClientOptions }
