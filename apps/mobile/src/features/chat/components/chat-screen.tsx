import type { ChatMessage, ConnectionState } from '../../../utils/websocket-client'
import type { VoiceRecorderStatus, VoiceTint } from './voice-note'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import Check from 'lucide-react-native/dist/esm/icons/check'
import CheckCheck from 'lucide-react-native/dist/esm/icons/check-check'
import CircleAlert from 'lucide-react-native/dist/esm/icons/circle-alert'
import Clock from 'lucide-react-native/dist/esm/icons/clock'
import ImagePlus from 'lucide-react-native/dist/esm/icons/image-plus'
import RotateCw from 'lucide-react-native/dist/esm/icons/rotate-cw'
import Send from 'lucide-react-native/dist/esm/icons/send'
import WifiOff from 'lucide-react-native/dist/esm/icons/wifi-off'
import X from 'lucide-react-native/dist/esm/icons/x'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { chatFetch, resolveMediaUrl } from '../../../utils/api-client'
import { websocketClient } from '../../../utils/websocket-client'
import { appAlert } from '../../common/components/app-alert'
import { useKeyboardHeight } from '../../common/hooks/use-keyboard-height'
import { useMediaUpload } from '../../media/hooks/use-media-upload'
import { VoiceNotePlayer, VoiceNoteRecorder } from './voice-note'

const PAGE_SIZE = 30

interface ChatScreenProps {
  conversationId: string
  currentUserId: string
  /** Kept for callers; the supplier quick replies were removed. */
  isSupplier?: boolean
  initialPromptMessage?: string
  /** One-tap messages shown above the composer (courier runs). */
  quickReplies?: string[]
}

type MessageStatus = 'pending' | 'sent' | 'failed'

interface DisplayMessage {
  id: string
  senderId: string
  content: string
  type: 'TEXT' | 'IMAGE' | 'VOICE' | 'LOCATION'
  createdAt: string
  isRead: boolean
  durationMs?: number | null
  status: MessageStatus
}

type ChatListItem
  = | { kind: 'message', message: DisplayMessage }
    | { kind: 'separator', id: string, label: string }

// Module-level counter: guarantees unique optimistic ids even within one ms
let tempSeq = 0
function makeTempId(): string {
  tempSeq += 1
  return `tmp-${Date.now()}-${tempSeq}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  if (sameDay(date, now))
    return 'Aujourd’hui'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday))
    return 'Hier'
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Maps a raw REST message payload to the display shape. */
function mapRestMessage(m: Record<string, unknown>): DisplayMessage {
  const apiType = (m.type as string) ?? 'TEXT'
  return {
    id: m.id as string,
    senderId: m.senderId as string,
    content: (m.content as string) ?? (m.mediaUrl as string) ?? '',
    type: (apiType === 'PHOTO' ? 'IMAGE' : apiType) as DisplayMessage['type'],
    createdAt: m.createdAt as string,
    isRead: m.readAt != null,
    durationMs: (m.durationMs as number | null | undefined) ?? null,
    status: 'sent',
  }
}

/** Union by id, newest first — keeps optimistic bubbles, dedupes refetches. */
function mergeMessages(prev: DisplayMessage[], incoming: DisplayMessage[]): DisplayMessage[] {
  const byId = new Map<string, DisplayMessage>()
  for (const m of prev) {
    byId.set(m.id, m)
  }
  for (const m of incoming) {
    byId.set(m.id, m)
  }
  return [...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/** Image de chat : résout le mediaId en URL signée avant affichage. */
function ChatImage({ mediaId, onPress }: { mediaId: string, onPress?: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void resolveMediaUrl(mediaId).then((u) => {
      if (!cancelled)
        setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [mediaId])
  if (!url) {
    return (
      <View style={[styles.bubbleImage, styles.mediaLoading]}>
        <ActivityIndicator size="small" color={colors.neutral[400]} />
      </View>
    )
  }
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress?.(url)}
      disabled={!onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel="Afficher l’image en plein écran"
    >
      <Image source={{ uri: url }} style={styles.bubbleImage} resizeMode="cover" />
    </TouchableOpacity>
  )
}

/** Note vocale de chat : résout le mediaId en URL signée avant lecture. */
function ChatVoice({ mediaId, durationMs, tint }: { mediaId: string, durationMs: number, tint: VoiceTint }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void resolveMediaUrl(mediaId).then((u) => {
      if (!cancelled)
        setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [mediaId])
  if (!url)
    return <ActivityIndicator size="small" color={colors.neutral[400]} />
  return <VoiceNotePlayer uri={url} durationMs={durationMs} tint={tint} seed={mediaId} />
}

export function ChatScreen({
  conversationId,
  currentUserId,
  initialPromptMessage,
  quickReplies,
}: ChatScreenProps) {
  const { semantic } = useTheme()
  const insets = useSafeAreaInsets()
  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    if (initialPromptMessage) {
      return [{
        id: 'auto-prompt',
        senderId: currentUserId,
        content: initialPromptMessage,
        type: 'TEXT',
        createdAt: new Date().toISOString(),
        isRead: false,
        status: 'sent',
      }]
    }
    return []
  })
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [remoteTyping, setRemoteTyping] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const [recorderStatus, setRecorderStatus] = useState<VoiceRecorderStatus>('idle')
  const [uploadingMsgId, setUploadingMsgId] = useState<string | null>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingOlderRef = useRef(false)
  const flatListRef = useRef<FlatList<ChatListItem>>(null)

  useEffect(() => {
    websocketClient.connect({
      onMessage: (msg: ChatMessage) => {
        if (msg.conversationId !== conversationId)
          return
        // Le serveur émet à toute la room (expéditeur inclus) : on ignore
        // l'écho de nos propres messages, déjà affichés en optimiste.
        if (msg.senderId === currentUserId)
          return
        setMessages(prev => mergeMessages(prev, [{
          id: msg.id,
          senderId: msg.senderId,
          content: msg.content,
          type: msg.type,
          createdAt: msg.createdAt,
          isRead: false,
          durationMs: msg.durationMs ?? null,
          status: 'sent',
        }]))
        websocketClient.sendReadReceipt(conversationId, msg.id)
      },
      onReadReceipt: (receipt) => {
        if (receipt.conversationId !== conversationId)
          return
        // Guard: never treat our own read receipt as the peer's
        if (receipt.readBy === currentUserId)
          return
        setMessages(prev => prev.map(m => (m.senderId === currentUserId ? { ...m, isRead: true } : m)))
      },
      onTyping: (event) => {
        if (event.conversationId !== conversationId)
          return
        if (event.userId !== currentUserId)
          setRemoteTyping(event.isTyping)
      },
      onConnectionChange: setConnectionState,
    })

    return () => {
      websocketClient.disconnect()
    }
  }, [conversationId, currentUserId])

  // Initial history load (REST) — DESC array, newest first
  useEffect(() => {
    let cancelled = false
    async function loadHistory(): Promise<void> {
      try {
        const res = await chatFetch(`/api/chat/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`)
        if (!res.ok)
          return
        const raw = await res.json() as Array<Record<string, unknown>>
        if (cancelled)
          return
        if (raw.length < PAGE_SIZE)
          setHasMore(false)
        setMessages(prev => mergeMessages(prev, raw.map(mapRestMessage)))
      }
      catch {
        // ignore — the reconnect catch-up will retry
      }
    }
    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  // Reconnect catch-up: join the room, mark as read, refetch latest and merge
  useEffect(() => {
    if (connectionState !== 'connected')
      return
    websocketClient.joinConversation(conversationId)
    websocketClient.sendReadReceipt(conversationId)
    let cancelled = false
    async function catchUp(): Promise<void> {
      try {
        const res = await chatFetch(`/api/chat/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`)
        if (!res.ok)
          return
        const raw = await res.json() as Array<Record<string, unknown>>
        if (cancelled)
          return
        setMessages(prev => mergeMessages(prev, raw.map(mapRestMessage)))
      }
      catch {
        // ignore — history already on screen, next reconnect will retry
      }
    }
    void catchUp()
    return () => {
      cancelled = true
    }
  }, [connectionState, conversationId])

  // Mark the conversation as read whenever the screen gains focus
  useFocusEffect(useCallback(() => {
    if (websocketClient.getConnectionState() === 'connected')
      websocketClient.sendReadReceipt(conversationId)
  }, [conversationId]))

  const { uploadFile, uploading, progress } = useMediaUpload({ context: 'CHAT_ATTACHMENT' })

  /** Emits chat:send with ack, then reconciles the optimistic bubble. */
  const deliverMessage = useCallback(async (
    tempId: string,
    content: string,
    type: DisplayMessage['type'],
    durationMs?: number | null,
  ) => {
    const ack = await websocketClient.sendMessage(conversationId, content, type, durationMs)
    if (ack.success && ack.message) {
      const server = ack.message
      setMessages((prev) => {
        // A reconnect refetch may already hold the persisted message
        const withoutTemp = prev.filter(m => m.id !== tempId && m.id !== server.id)
        return mergeMessages(withoutTemp, [{
          id: server.id,
          senderId: server.senderId,
          content: server.content,
          type: server.type,
          createdAt: server.createdAt,
          isRead: false,
          durationMs: server.durationMs ?? durationMs ?? null,
          status: 'sent',
        }])
      })
    }
    else if (ack.success) {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: 'sent' } : m)))
    }
    else {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: 'failed' } : m)))
    }
  }, [conversationId])

  const sendTextMessage = useCallback((text: string) => {
    const tempId = makeTempId()
    setMessages(prev => [{
      id: tempId,
      senderId: currentUserId,
      content: text,
      type: 'TEXT' as const,
      createdAt: new Date().toISOString(),
      isRead: false,
      status: 'pending' as const,
    }, ...prev])
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
    void deliverMessage(tempId, text, 'TEXT')
  }, [currentUserId, deliverMessage])

  const handleSendText = useCallback(() => {
    const trimmed = inputText.trim()
    if (!trimmed)
      return
    sendTextMessage(trimmed)
    setInputText('')
    websocketClient.sendTyping(conversationId, false)
  }, [inputText, conversationId, sendTextMessage])

  const handleTextChange = useCallback((text: string) => {
    setInputText(text)
    if (!isTyping) {
      setIsTyping(true)
      websocketClient.sendTyping(conversationId, true)
    }
    if (typingTimeout.current)
      clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      setIsTyping(false)
      websocketClient.sendTyping(conversationId, false)
    }, 2000)
  }, [conversationId, isTyping])

  /** Optimistic media bubble first, then upload, then chat:send. */
  const startMediaSend = useCallback(async (
    localUri: string,
    fileName: string,
    mimeType: string,
    type: 'IMAGE' | 'VOICE',
    durationMs?: number,
  ) => {
    const tempId = makeTempId()
    setMessages(prev => [{
      id: tempId,
      senderId: currentUserId,
      content: localUri,
      type,
      createdAt: new Date().toISOString(),
      isRead: false,
      durationMs: durationMs ?? null,
      status: 'pending' as const,
    }, ...prev])
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true })
    setUploadingMsgId(tempId)
    const uploaded = await uploadFile(localUri, fileName, mimeType, 0)
    setUploadingMsgId(null)
    if (!uploaded) {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, status: 'failed' as const } : m)))
      return
    }
    // On envoie le mediaId : l'affichage résout une URL signée (bucket privé)
    setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, content: uploaded.mediaId } : m)))
    void deliverMessage(tempId, uploaded.mediaId, type, durationMs ?? null)
  }, [currentUserId, uploadFile, deliverMessage])

  const handleSendPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      appAlert('Permission requise', 'Autorisez l’accès à la galerie pour ajouter des photos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0])
      return
    const asset = result.assets[0]
    void startMediaSend(asset.uri, asset.fileName ?? 'photo.jpg', asset.mimeType ?? 'image/jpeg', 'IMAGE')
  }, [startMediaSend])

  const handleSendVoice = useCallback((uri: string, durationMs: number) => {
    void startMediaSend(uri, 'voice-note.m4a', 'audio/m4a', 'VOICE', durationMs)
  }, [startMediaSend])

  /** Retries a failed bubble: re-upload if the media never left the device. */
  const handleRetry = useCallback((message: DisplayMessage) => {
    setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, status: 'pending' as const } : m)))
    const needsUpload = (message.type === 'IMAGE' || message.type === 'VOICE') && message.content.startsWith('file:')
    if (needsUpload) {
      void (async () => {
        setUploadingMsgId(message.id)
        const uploaded = await uploadFile(
          message.content,
          message.type === 'VOICE' ? 'voice-note.m4a' : 'photo.jpg',
          message.type === 'VOICE' ? 'audio/m4a' : 'image/jpeg',
          0,
        )
        setUploadingMsgId(null)
        if (!uploaded) {
          setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, status: 'failed' as const } : m)))
          return
        }
        setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, content: uploaded.mediaId } : m)))
        void deliverMessage(message.id, uploaded.mediaId, message.type, message.durationMs ?? null)
      })()
    }
    else {
      void deliverMessage(message.id, message.content, message.type, message.durationMs ?? null)
    }
  }, [uploadFile, deliverMessage])

  /** Loads the previous page (inverted list: onEndReached = scrolled to top). */
  const handleLoadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore)
      return
    const persisted = messages.filter(m => !m.id.startsWith('tmp-') && m.id !== 'auto-prompt')
    const oldest = persisted[persisted.length - 1]
    if (!oldest)
      return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const res = await chatFetch(`/api/chat/conversations/${conversationId}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest.createdAt)}`)
      if (res.ok) {
        const raw = await res.json() as Array<Record<string, unknown>>
        if (raw.length < PAGE_SIZE)
          setHasMore(false)
        if (raw.length > 0)
          setMessages(prev => mergeMessages(prev, raw.map(mapRestMessage)))
      }
    }
    catch {
      // network hiccup — scrolling up again retries
    }
    finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [conversationId, hasMore, messages])

  // Day separators: with an inverted DESC list, the separator for a day goes
  // after the oldest message of that day so it renders above the group.
  const listData = useMemo<ChatListItem[]>(() => {
    const items: ChatListItem[] = []
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      items.push({ kind: 'message', message })
      const next = messages[i + 1]
      const date = new Date(message.createdAt)
      if (!next || !sameDay(date, new Date(next.createdAt))) {
        items.push({
          kind: 'separator',
          id: `sep-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
          label: dayLabel(message.createdAt),
        })
      }
    }
    return items
  }, [messages])

  const renderItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.kind === 'separator') {
      return (
        <View style={styles.separatorRow}>
          <Text style={[styles.separatorText, { color: semantic.textTertiary, backgroundColor: semantic.bgSurface }]}>
            {item.label}
          </Text>
        </View>
      )
    }

    const message = item.message
    const isSent = message.senderId === currentUserId
    const isFailed = message.status === 'failed'
    const metaColor = isSent ? 'rgba(255,255,255,0.75)' : semantic.textTertiary
    const isUploadingThis = uploadingMsgId === message.id && uploading

    return (
      <View style={[styles.row, isSent ? styles.rowSent : styles.rowReceived]}>
        <TouchableOpacity
          activeOpacity={isFailed ? 0.7 : 1}
          disabled={!isFailed}
          onPress={() => handleRetry(message)}
          accessibilityRole={isFailed ? 'button' : undefined}
          accessibilityLabel={isFailed ? 'Message non envoyé, appuyez pour réessayer' : undefined}
          style={[
            styles.bubble,
            isSent
              ? { backgroundColor: colors.green[400], borderBottomRightRadius: radius.xs }
              : { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight, borderWidth: 1, borderBottomLeftRadius: radius.xs },
            isFailed && styles.bubbleFailed,
          ]}
        >
          {message.type === 'VOICE'
            ? (
                <ChatVoice mediaId={message.content} durationMs={message.durationMs ?? 0} tint={isSent ? 'own' : 'peer'} />
              )
            : message.type === 'IMAGE'
              ? (
                  <View>
                    <ChatImage mediaId={message.content} onPress={setViewerUrl} />
                    {message.status === 'pending' && (
                      <View style={styles.mediaOverlay}>
                        <ActivityIndicator size="small" color={colors.neutral[0]} />
                        {isUploadingThis && (
                          <Text style={styles.mediaOverlayText}>{`${Math.round(progress * 100)} %`}</Text>
                        )}
                      </View>
                    )}
                  </View>
                )
              : (
                  <Text style={[styles.bubbleText, { color: isSent ? colors.neutral[0] : semantic.textPrimary }]}>
                    {message.content}
                  </Text>
                )}
          <View style={styles.metaRow}>
            {isUploadingThis && message.type === 'VOICE' && (
              <Text style={[styles.metaTime, { color: metaColor }]}>{`${Math.round(progress * 100)} %`}</Text>
            )}
            <Text style={[styles.metaTime, { color: metaColor }]}>{formatTime(message.createdAt)}</Text>
            {isSent && message.status === 'pending' && <Clock size={14} color={metaColor} />}
            {isSent && message.status === 'failed' && <CircleAlert size={14} color={colors.coral[100]} />}
            {isSent && message.status === 'sent' && (message.isRead
              ? <CheckCheck size={14} color={colors.neutral[0]} />
              : <Check size={14} color={metaColor} />)}
          </View>
        </TouchableOpacity>
        {isFailed && (
          <TouchableOpacity
            style={styles.retryRow}
            onPress={() => handleRetry(message)}
            accessibilityRole="button"
            accessibilityLabel="Réessayer l’envoi"
          >
            <RotateCw size={13} color={colors.coral[600]} />
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }, [currentUserId, semantic, handleRetry, uploadingMsgId, uploading, progress])

  const keyExtractor = useCallback((item: ChatListItem) => (item.kind === 'separator' ? item.id : item.message.id), [])
  const hasText = inputText.trim().length > 0
  const isOffline = connectionState !== 'connected'
  const isRecordingVoice = recorderStatus !== 'idle'
  const keyboardHeight = useKeyboardHeight()

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: semantic.bgPage }]}
      // Edge-to-edge (SDK 54, Android 15+): the window no longer resizes for the
      // keyboard, so the screen must pad itself on both platforms.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {connectionState === 'reconnecting' && (
        <View style={[styles.connectionBanner, { backgroundColor: colors.earth[50] }]}>
          <WifiOff size={14} color={colors.earth[600]} />
          <Text style={[styles.connectionText, { color: colors.earth[600] }]}>Reconnexion…</Text>
        </View>
      )}
      {connectionState === 'disconnected' && (
        <View style={[styles.connectionBanner, { backgroundColor: colors.coral[50] }]}>
          <WifiOff size={14} color={colors.coral[600]} />
          <Text style={[styles.connectionText, { color: colors.coral[600] }]}>Hors connexion</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        inverted
        style={styles.list}
        contentContainerStyle={[styles.messageList, listData.length === 0 && styles.messageListEmpty]}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          void handleLoadOlder()
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingOlder
          ? (
              <View style={styles.olderLoading}>
                <ActivityIndicator size="small" color={semantic.textTertiary} />
              </View>
            )
          : null}
        ListEmptyComponent={(
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: semantic.textTertiary }]}>Démarrez la conversation</Text>
          </View>
        )}
      />

      {remoteTyping && (
        <View style={styles.typingContainer}>
          <Text style={[styles.typingText, { color: semantic.textTertiary }]}>En train d'écrire…</Text>
        </View>
      )}

      {quickReplies && quickReplies.length > 0 && !isRecordingVoice && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={[styles.quickRow, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight }]}
          contentContainerStyle={styles.quickRowContent}
        >
          {quickReplies.map(reply => (
            <TouchableOpacity
              key={reply}
              style={[styles.quickChip, { borderColor: colors.green[200], backgroundColor: semantic.bgPrimaryLight }, isOffline && styles.buttonDisabled]}
              onPress={() => sendTextMessage(reply)}
              disabled={isOffline}
              accessibilityRole="button"
              accessibilityLabel={`Envoyer : ${reply}`}
            >
              <Text style={[styles.quickText, { color: colors.green[800] }]} numberOfLines={1}>{reply}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={[styles.inputBar, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight, paddingBottom: (keyboardHeight > 0 ? keyboardHeight : insets.bottom) + spacing[2] }]}>
        {!isRecordingVoice && (
          <TouchableOpacity
            style={[styles.iconButton, isOffline && styles.buttonDisabled]}
            onPress={handleSendPhoto}
            disabled={isOffline}
            accessibilityRole="button"
            accessibilityLabel="Envoyer une photo"
          >
            <ImagePlus size={22} color={semantic.textSecondary} />
          </TouchableOpacity>
        )}

        {/* The recording bar takes the whole row while a voice note is being captured */}
        {!isRecordingVoice && (
          <TextInput
            style={[styles.input, { backgroundColor: semantic.bgSurface, color: semantic.textPrimary, borderColor: semantic.borderNormal }]}
            placeholder="Message…"
            placeholderTextColor={semantic.textTertiary}
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            maxLength={2000}
            accessibilityLabel="Saisir un message"
          />
        )}

        {hasText && !isRecordingVoice
          ? (
              <TouchableOpacity
                style={[styles.sendButton, isOffline && styles.buttonDisabled]}
                onPress={handleSendText}
                disabled={isOffline}
                accessibilityRole="button"
                accessibilityLabel="Envoyer"
              >
                <Send size={18} color={colors.neutral[0]} />
              </TouchableOpacity>
            )
          : (
              <VoiceNoteRecorder onSend={handleSendVoice} disabled={isOffline} onStatusChange={setRecorderStatus} />
            )}
      </View>

      {/* Visionneuse d'image plein écran */}
      <Modal
        visible={viewerUrl != null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUrl(null)}
      >
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerBackdropTouch}
            activeOpacity={1}
            onPress={() => setViewerUrl(null)}
            accessibilityLabel="Fermer la visionneuse"
          >
            {viewerUrl != null && (
              <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewerClose, { top: insets.top + spacing[2] }]}
            onPress={() => setViewerUrl(null)}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <X size={24} color={colors.neutral[0]} />
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  connectionBanner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[1],
    paddingVertical: spacing[1],
  },
  connectionText: { ...typography.caption },
  list: { flex: 1 },
  messageList: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], gap: spacing[1] },
  messageListEmpty: { flexGrow: 1, justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: spacing[8] },
  emptyText: { ...typography.bodyS },
  olderLoading: { paddingVertical: spacing[3], alignItems: 'center' },

  separatorRow: { alignItems: 'center', paddingVertical: spacing[2] },
  separatorText: {
    ...typography.caption,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },

  row: { maxWidth: '82%' },
  rowSent: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowReceived: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  bubbleFailed: { opacity: 0.75 },
  bubbleText: { ...typography.bodyS },
  bubbleImage: { width: 220, height: 220, borderRadius: radius.md },
  mediaLoading: { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.neutral[100] },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[1],
  },
  mediaOverlayText: { ...typography.caption, color: colors.neutral[0] },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing[1],
    marginTop: 2,
  },
  metaTime: { fontFamily: fonts.sans, fontSize: 10 },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    minHeight: 44,
    paddingHorizontal: spacing[2],
  },
  retryText: { ...typography.caption, color: colors.coral[600] },

  typingContainer: { paddingHorizontal: spacing[4], paddingBottom: spacing[1] },
  typingText: { ...typography.caption, fontStyle: 'italic' },

  quickRow: {
    flexGrow: 0,
    borderTopWidth: 1,
  },
  quickRowContent: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  quickChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  quickText: {
    fontFamily: fonts.sansMd,
    fontSize: 13,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },

  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  viewerBackdropTouch: { flex: 1, justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: {
    position: 'absolute',
    right: spacing[3],
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
