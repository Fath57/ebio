import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import { getChatToken } from './api-client'

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3000'
const WS_NAMESPACE = '/ws/chat'

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
  readBy?: string
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

/** Convertit le type interne mobile vers le type attendu par l'API (MessageType). */
function toApiType(type: ChatMessage['type']): string {
  return type === 'IMAGE' ? 'PHOTO' : type
}

/** Convertit le type API (PHOTO) vers le type interne mobile (IMAGE). */
function fromApiType(type: string): ChatMessage['type'] {
  if (type === 'PHOTO')
    return 'IMAGE'
  if (type === 'VOICE' || type === 'LOCATION' || type === 'TEXT')
    return type
  return 'TEXT'
}

class WebSocketClient {
  private socket: Socket | null = null
  private connectionState: ConnectionState = 'disconnected'
  private handlers: WebSocketClientOptions = {}

  connect(options: WebSocketClientOptions): void {
    this.handlers = options
    void this.establishConnection()
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
    this.updateConnectionState('disconnected')
  }

  sendMessage(conversationId: string, content: string, type: ChatMessage['type'] = 'TEXT'): void {
    const apiType = toApiType(type)
    const payload: Record<string, unknown> = { conversationId, type: apiType }
    if (apiType === 'TEXT') {
      payload.content = content
    }
    else {
      payload.mediaUrl = content
    }
    this.socket?.emit('chat:send', payload)
  }

  sendReadReceipt(conversationId: string, _messageId?: string): void {
    this.socket?.emit('chat:read', { conversationId })
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    this.socket?.emit('chat:typing', { conversationId, isTyping })
  }

  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  private async establishConnection(): Promise<void> {
    const token = await getChatToken()
    if (!token) {
      this.updateConnectionState('disconnected')
      return
    }

    // Déconnecte une éventuelle socket précédente
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
    }

    this.socket = io(`${WS_URL}${WS_NAMESPACE}`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: MAX_RETRIES,
      reconnectionDelay: BASE_DELAY_MS,
      reconnectionDelayMax: MAX_DELAY_MS,
    })

    this.socket.on('connect', () => {
      this.updateConnectionState('connected')
    })

    this.socket.on('disconnect', () => {
      this.updateConnectionState('disconnected')
    })

    this.socket.io.on('reconnect_attempt', () => {
      this.updateConnectionState('reconnecting')
    })

    this.socket.on('chat:message', (data: Record<string, unknown>) => {
      this.handlers.onMessage?.({
        id: data.id as string,
        conversationId: data.conversationId as string,
        senderId: data.senderId as string,
        content: (data.content as string) ?? (data.mediaUrl as string) ?? '',
        type: fromApiType((data.type as string) ?? 'TEXT'),
        createdAt: data.createdAt as string,
      })
    })

    this.socket.on('chat:read', (data: Record<string, unknown>) => {
      this.handlers.onReadReceipt?.({
        conversationId: data.conversationId as string,
        readBy: data.readBy as string | undefined,
        readAt: (data.readAt as string) ?? new Date().toISOString(),
      })
    })

    this.socket.on('chat:typing', (data: Record<string, unknown>) => {
      this.handlers.onTyping?.({
        conversationId: data.conversationId as string,
        userId: data.userId as string,
        isTyping: Boolean(data.isTyping),
      })
    })
  }

  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state
    this.handlers.onConnectionChange?.(state)
  }
}

export const websocketClient = new WebSocketClient()

export type { ChatMessage, ConnectionState, ReadReceipt, TypingEvent, WebSocketClientOptions }
