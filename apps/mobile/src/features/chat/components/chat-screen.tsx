import type { ChatMessage, ConnectionState } from '../../../utils/websocket-client'
import Check from 'lucide-react-native/dist/esm/icons/check'
import CheckCheck from 'lucide-react-native/dist/esm/icons/check-check'
import ImagePlus from 'lucide-react-native/dist/esm/icons/image-plus'
import Send from 'lucide-react-native/dist/esm/icons/send'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import { useTheme } from '../../../theme/theme-context'
import { chatFetch } from '../../../utils/api-client'
import { websocketClient } from '../../../utils/websocket-client'
import { useMediaUpload } from '../../media/hooks/use-media-upload'
import { QuickReplies } from './quick-replies'
import { VoiceNotePlayer, VoiceNoteRecorder } from './voice-note'

interface ChatScreenProps {
  conversationId: string
  currentUserId: string
  isSupplier?: boolean
  initialPromptMessage?: string
}

interface DisplayMessage {
  id: string
  senderId: string
  content: string
  type: 'TEXT' | 'IMAGE' | 'VOICE' | 'LOCATION'
  createdAt: string
  isRead: boolean
  voiceDurationMs?: number
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function ChatScreen({
  conversationId,
  currentUserId,
  isSupplier = false,
  initialPromptMessage,
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
      }]
    }
    return []
  })
  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [remoteTyping, setRemoteTyping] = useState(false)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flatListRef = useRef<FlatList<DisplayMessage>>(null)

  useEffect(() => {
    websocketClient.connect({
      onMessage: (msg: ChatMessage) => {
        if (msg.conversationId !== conversationId)
          return
        // Le serveur émet à toute la room (expéditeur inclus) : on ignore
        // l'écho de nos propres messages, déjà affichés en optimiste.
        if (msg.senderId === currentUserId)
          return
        setMessages(prev => [{
          id: msg.id,
          senderId: msg.senderId,
          content: msg.content,
          type: msg.type,
          createdAt: msg.createdAt,
          isRead: false,
        }, ...prev])
        websocketClient.sendReadReceipt(conversationId, msg.id)
      },
      onReadReceipt: (receipt) => {
        if (receipt.conversationId !== conversationId)
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

  useEffect(() => {
    let cancelled = false
    async function loadHistory(): Promise<void> {
      try {
        const res = await chatFetch(`/api/chat/conversations/${conversationId}/messages?limit=30`)
        if (!res.ok)
          return
        const raw = await res.json() as Array<Record<string, unknown>>
        if (cancelled)
          return
        const history: DisplayMessage[] = raw.map(m => ({
          id: m.id as string,
          senderId: m.senderId as string,
          content: (m.content as string) ?? (m.mediaUrl as string) ?? '',
          type: ((m.type as string) === 'PHOTO' ? 'IMAGE' : (m.type as string)) as DisplayMessage['type'],
          createdAt: m.createdAt as string,
          isRead: m.readAt != null,
        }))
        setMessages(prev => [...prev.filter(p => p.id === 'auto-prompt'), ...history])
      }
      catch {
        // ignore
      }
    }
    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  const handleSendText = useCallback(() => {
    const trimmed = inputText.trim()
    if (!trimmed)
      return
    websocketClient.sendMessage(conversationId, trimmed, 'TEXT')
    setMessages(prev => [{
      id: Date.now().toString(),
      senderId: currentUserId,
      content: trimmed,
      type: 'TEXT',
      createdAt: new Date().toISOString(),
      isRead: false,
    }, ...prev])
    setInputText('')
    websocketClient.sendTyping(conversationId, false)
  }, [inputText, conversationId, currentUserId])

  const handleQuickReply = useCallback((message: string) => {
    websocketClient.sendMessage(conversationId, message, 'TEXT')
    setMessages(prev => [{
      id: Date.now().toString(),
      senderId: currentUserId,
      content: message,
      type: 'TEXT',
      createdAt: new Date().toISOString(),
      isRead: false,
    }, ...prev])
  }, [conversationId, currentUserId])

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

  const { pickAndUpload } = useMediaUpload({ context: 'CHAT_ATTACHMENT' })

  const handleSendPhoto = useCallback(async () => {
    const uploaded = await pickAndUpload()
    if (uploaded) {
      const url = uploaded.publicUrl ?? uploaded.mediaId
      websocketClient.sendMessage(conversationId, url, 'IMAGE')
      setMessages(prev => [{
        id: Date.now().toString(),
        senderId: currentUserId,
        content: url,
        type: 'IMAGE',
        createdAt: new Date().toISOString(),
        isRead: false,
      }, ...prev])
    }
  }, [conversationId, currentUserId])

  const handleSendVoice = useCallback((uri: string, durationMs: number) => {
    websocketClient.sendMessage(conversationId, uri, 'VOICE')
    setMessages(prev => [{
      id: Date.now().toString(),
      senderId: currentUserId,
      content: uri,
      type: 'VOICE',
      createdAt: new Date().toISOString(),
      isRead: false,
      voiceDurationMs: durationMs,
    }, ...prev])
  }, [conversationId, currentUserId])

  const renderMessage = useCallback(({ item }: { item: DisplayMessage }) => {
    const isSent = item.senderId === currentUserId
    const metaColor = isSent ? 'rgba(255,255,255,0.75)' : semantic.textTertiary
    return (
      <View style={[styles.row, isSent ? styles.rowSent : styles.rowReceived]}>
        <View
          style={[
            styles.bubble,
            isSent
              ? { backgroundColor: colors.green[400], borderBottomRightRadius: radius.xs }
              : { backgroundColor: semantic.bgCard, borderColor: semantic.borderLight, borderWidth: 1, borderBottomLeftRadius: radius.xs },
          ]}
        >
          {item.type === 'VOICE'
            ? (
                <VoiceNotePlayer uri={item.content} durationMs={item.voiceDurationMs ?? 0} />
              )
            : item.type === 'IMAGE'
              ? (
                  <Image source={{ uri: item.content }} style={styles.bubbleImage} resizeMode="cover" />
                )
              : (
                  <Text style={[styles.bubbleText, { color: isSent ? colors.neutral[0] : semantic.textPrimary }]}>
                    {item.content}
                  </Text>
                )}
          <View style={styles.metaRow}>
            <Text style={[styles.metaTime, { color: metaColor }]}>{formatTime(item.createdAt)}</Text>
            {isSent && (item.isRead
              ? <CheckCheck size={14} color={colors.neutral[0]} />
              : <Check size={14} color={metaColor} />)}
          </View>
        </View>
      </View>
    )
  }, [currentUserId, semantic])

  const keyExtractor = useCallback((item: DisplayMessage) => item.id, [])
  const hasText = inputText.trim().length > 0

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: semantic.bgPage }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {connectionState === 'reconnecting' && (
        <View style={[styles.connectionBanner, { backgroundColor: colors.earth[50] }]}>
          <Text style={styles.connectionText}>Reconnexion…</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        inverted={messages.length > 0}
        style={styles.list}
        contentContainerStyle={[styles.messageList, messages.length === 0 && styles.messageListEmpty]}
        showsVerticalScrollIndicator={false}
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

      {isSupplier && <QuickReplies onSend={handleQuickReply} />}

      <View style={[styles.inputBar, { backgroundColor: semantic.bgCard, borderTopColor: semantic.borderLight, paddingBottom: insets.bottom + spacing[2] }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleSendPhoto}
          accessibilityRole="button"
          accessibilityLabel="Envoyer une photo"
        >
          <ImagePlus size={22} color={semantic.textSecondary} />
        </TouchableOpacity>

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

        {hasText
          ? (
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSendText}
                accessibilityRole="button"
                accessibilityLabel="Envoyer"
              >
                <Send size={18} color={colors.neutral[0]} />
              </TouchableOpacity>
            )
          : (
              <VoiceNoteRecorder onSend={handleSendVoice} />
            )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  connectionBanner: { paddingVertical: spacing[1], alignItems: 'center' },
  connectionText: { ...typography.caption, color: colors.earth[600] },
  list: { flex: 1 },
  messageList: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], gap: spacing[1] },
  messageListEmpty: { flexGrow: 1, justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: spacing[8] },
  emptyText: { ...typography.bodyS },

  row: { maxWidth: '82%' },
  rowSent: { alignSelf: 'flex-end' },
  rowReceived: { alignSelf: 'flex-start' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  bubbleText: { ...typography.bodyS },
  bubbleImage: { width: 220, height: 220, borderRadius: radius.md },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing[1],
    marginTop: 2,
  },
  metaTime: { fontFamily: fonts.sans, fontSize: 10 },

  typingContainer: { paddingHorizontal: spacing[4], paddingBottom: spacing[1] },
  typingText: { ...typography.caption, fontStyle: 'italic' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
})
