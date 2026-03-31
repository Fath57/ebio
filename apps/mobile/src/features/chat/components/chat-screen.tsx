import type { ChatMessage, ConnectionState } from '../../../utils/websocket-client'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { colors, fonts, radius, spacing, typography } from '../../../theme/theme'
import {

  websocketClient,
} from '../../../utils/websocket-client'
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

export function ChatScreen({
  conversationId,
  currentUserId,
  isSupplier = false,
  initialPromptMessage,
}: ChatScreenProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    if (initialPromptMessage) {
      return [
        {
          id: 'auto-prompt',
          senderId: currentUserId,
          content: initialPromptMessage,
          type: 'TEXT',
          createdAt: new Date().toISOString(),
          isRead: false,
        },
      ]
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
        setMessages(prev => [
          {
            id: msg.id,
            senderId: msg.senderId,
            content: msg.content,
            type: msg.type,
            createdAt: msg.createdAt,
            isRead: false,
          },
          ...prev,
        ])
        if (msg.senderId !== currentUserId) {
          websocketClient.sendReadReceipt(conversationId, msg.id)
        }
      },
      onReadReceipt: (receipt) => {
        if (receipt.conversationId !== conversationId)
          return
        setMessages(prev =>
          prev.map(m =>
            m.id === receipt.messageId ? { ...m, isRead: true } : m,
          ),
        )
      },
      onTyping: (event) => {
        if (event.conversationId !== conversationId)
          return
        if (event.userId !== currentUserId) {
          setRemoteTyping(event.isTyping)
        }
      },
      onConnectionChange: setConnectionState,
    })

    return () => {
      websocketClient.disconnect()
    }
  }, [conversationId, currentUserId])

  const handleSendText = useCallback(() => {
    const trimmed = inputText.trim()
    if (!trimmed)
      return

    websocketClient.sendMessage(conversationId, trimmed, 'TEXT')
    setMessages(prev => [
      {
        id: Date.now().toString(),
        senderId: currentUserId,
        content: trimmed,
        type: 'TEXT',
        createdAt: new Date().toISOString(),
        isRead: false,
      },
      ...prev,
    ])
    setInputText('')
    websocketClient.sendTyping(conversationId, false)
  }, [inputText, conversationId, currentUserId])

  const handleQuickReply = useCallback((message: string) => {
    websocketClient.sendMessage(conversationId, message, 'TEXT')
    setMessages(prev => [
      {
        id: Date.now().toString(),
        senderId: currentUserId,
        content: message,
        type: 'TEXT',
        createdAt: new Date().toISOString(),
        isRead: false,
      },
      ...prev,
    ])
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
      websocketClient.sendMessage(conversationId, uploaded.publicUrl ?? uploaded.mediaId, 'IMAGE')
      setMessages(prev => [
        {
          id: Date.now().toString(),
          senderId: currentUserId,
          content: uri,
          type: 'IMAGE',
          createdAt: new Date().toISOString(),
          isRead: false,
        },
        ...prev,
      ])
    }
  }, [conversationId, currentUserId])

  const handleSendVoice = useCallback((uri: string, durationMs: number) => {
    websocketClient.sendMessage(conversationId, uri, 'VOICE')
    setMessages(prev => [
      {
        id: Date.now().toString(),
        senderId: currentUserId,
        content: uri,
        type: 'VOICE',
        createdAt: new Date().toISOString(),
        isRead: false,
        voiceDurationMs: durationMs,
      },
      ...prev,
    ])
  }, [conversationId, currentUserId])

  function formatTime(iso: string): string {
    const date = new Date(iso)
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  const renderMessage = useCallback(({ item }: { item: DisplayMessage }) => {
    const isSent = item.senderId === currentUserId
    return (
      <View
        style={[
          styles.messageBubbleContainer,
          isSent ? styles.sentContainer : styles.receivedContainer,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isSent ? styles.sentBubble : styles.receivedBubble,
          ]}
        >
          {item.type === 'VOICE'
            ? (
                <VoiceNotePlayer uri={item.content} durationMs={item.voiceDurationMs ?? 0} />
              )
            : (
                <Text
                  style={[
                    styles.messageText,
                    isSent ? styles.sentText : styles.receivedText,
                  ]}
                >
                  {item.content}
                </Text>
              )}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
          {isSent && (
            <Text style={styles.readReceipt}>
              {item.isRead ? '\u2713\u2713' : '\u2713'}
            </Text>
          )}
        </View>
      </View>
    )
  }, [currentUserId])

  const keyExtractor = useCallback((item: DisplayMessage) => item.id, [])

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {connectionState === 'reconnecting' && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionText}>Reconnexion en cours...</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        inverted
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
      />

      {remoteTyping && (
        <View style={styles.typingContainer}>
          <Text style={styles.typingText}>
            en train d'
            {'é'}
            crire...
          </Text>
        </View>
      )}

      {isSupplier && <QuickReplies onSend={handleQuickReply} />}

      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handleSendPhoto}
          accessibilityRole="button"
          accessibilityLabel="Envoyer une photo"
        >
          <Text style={styles.attachIcon}>{'\uD83D\uDCF7'}</Text>
        </TouchableOpacity>

        <VoiceNoteRecorder onSend={handleSendVoice} />

        <TextInput
          style={styles.textInput}
          placeholder="Votre message..."
          placeholderTextColor={colors.neutral[400]}
          value={inputText}
          onChangeText={handleTextChange}
          multiline
          maxLength={2000}
          accessibilityLabel="Saisir un message"
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            !inputText.trim() && styles.sendButtonDisabled,
          ]}
          onPress={handleSendText}
          disabled={!inputText.trim()}
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
        >
          <Text style={styles.sendIcon}>{'\u2191'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.neutral[0],
  },
  connectionBanner: {
    backgroundColor: colors.earth[50],
    paddingVertical: spacing[1],
    alignItems: 'center',
  },
  connectionText: {
    ...typography.caption,
    color: colors.earth[600],
  },
  messageList: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  messageBubbleContainer: {
    marginVertical: spacing[1],
    maxWidth: '80%',
  },
  sentContainer: {
    alignSelf: 'flex-end',
  },
  receivedContainer: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  sentBubble: {
    backgroundColor: colors.green[400],
  },
  receivedBubble: {
    backgroundColor: colors.neutral[100],
  },
  messageText: {
    ...typography.bodyS,
  },
  sentText: {
    color: colors.neutral[0],
  },
  receivedText: {
    color: colors.neutral[800],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    marginTop: 2,
    paddingHorizontal: spacing[1],
  },
  timeText: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.neutral[400],
  },
  readReceipt: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.green[400],
  },
  typingContainer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
  },
  typingText: {
    ...typography.caption,
    color: colors.neutral[400],
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    paddingBottom: Platform.OS === 'ios' ? spacing[6] : spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
    backgroundColor: colors.neutral[0],
  },
  attachButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachIcon: {
    fontSize: 22,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.neutral[800],
    backgroundColor: colors.neutral[50],
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.green[400],
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.neutral[200],
  },
  sendIcon: {
    fontFamily: fonts.sansBd,
    fontSize: 18,
    color: colors.neutral[0],
  },
})
